package main

import (
	"bytes"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
)

const (
	ruidaSourcePort             = 40200
	ruidaDestPort               = 50200
	ruidaTimeout                = 3 * time.Second
	ruidaChunkSize              = 998
	defaultEngraveLineSpacingMM = 0.1
	ruidaMinimumEngraveLineMM   = 0.05
	ruidaMarkMinPowerRatio      = 0.35
)

type RuidaController struct {
	IPAddress string
	Port      int

	conn *net.UDPConn
	addr *net.UDPAddr
}

type ruidaPoint struct {
	x float64
	y float64
}

type ruidaSegment struct {
	from ruidaPoint
	to   ruidaPoint
	op   string
}

type ruidaFillShape struct {
	contours [][]ruidaPoint
	op       string
}

type ruidaBounds struct {
	minX float64
	minY float64
	maxX float64
	maxY float64
	set  bool
}

type ruidaTransform struct {
	a float64
	b float64
	c float64
	d float64
	e float64
	f float64
}

type ruidaStyle struct {
	stroke string
	fill   string
}

type ruidaLayer struct {
	op       string
	settings OperationSettings
	segments []ruidaSegment
	bounds   ruidaBounds
	color    uint32
}

type ruidaStream struct {
	buf bytes.Buffer
}

func (r *RuidaController) Connect() error {
	port := r.Port
	if port == 0 {
		port = ruidaDestPort
	}

	addr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", r.IPAddress, port))
	if err != nil {
		return fmt.Errorf("ruida: resolve %s:%d: %w", r.IPAddress, port, err)
	}

	conn, err := net.DialUDP("udp", &net.UDPAddr{Port: ruidaSourcePort}, addr)
	if err != nil {
		conn, err = net.DialUDP("udp", nil, addr)
		if err != nil {
			return fmt.Errorf("ruida: dial %s: %w", addr.String(), err)
		}
	}

	r.conn = conn
	r.addr = addr
	log.Printf("[Ruida] UDP ready: %s", addr.String())
	return nil
}

func (r *RuidaController) Disconnect() error {
	if r.conn == nil {
		return nil
	}
	err := r.conn.Close()
	r.conn = nil
	r.addr = nil
	return err
}

func (r *RuidaController) SendJob(jobName string, svgData string, profile MaterialProfile, options JobOptions, jobLog *JobExecutionLog) error {
	if r.conn == nil {
		return fmt.Errorf("ruida: not connected")
	}
	options = normalizeJobOptions(options)

	jobLog.Add("Ruida sender selected.")
	jobLog.Add("UDP destination: %s", r.addr.String())
	jobLog.Add("UDP local socket: %s", r.conn.LocalAddr().String())
	jobLog.Add("UDP chunk size: %d bytes", ruidaChunkSize)

	segments, err := parseRuidaSVG(svgData, options)
	if err != nil {
		return err
	}
	jobLog.Add("Parsed SVG geometry: %d supported vector segment(s).", len(segments))
	if len(segments) == 0 {
		return fmt.Errorf("ruida: no supported vector geometry found")
	}

	layers := buildRuidaLayers(segments, profile)
	jobLog.Add("Built %d active layer(s) from color operations.", len(layers))
	if len(layers) == 0 {
		return fmt.Errorf("ruida: no enabled vector layers found")
	}
	for i, layer := range layers {
		minPower, maxPower := layerPowerRange(layer)
		jobLog.Add(
			"Layer %d: %s, %d segment(s), speed %d, power %d%%, bounds %.3f/%.3f to %.3f/%.3f mm.",
			i,
			layer.op,
			len(layer.segments),
			layer.settings.Speed,
			maxPower,
			layer.bounds.minX,
			layer.bounds.minY,
			layer.bounds.maxX,
			layer.bounds.maxY,
		)
		if layer.op == "mark" && minPower != maxPower {
			jobLog.Add("Layer %d mark power compensation: min %d%%, max %d%%.", i, minPower, maxPower)
		}
		if layer.op == "engrave" {
			jobLog.Add("Layer %d engrave fill mode: bidirectional scanlines at %.2f mm spacing.", i, options.EngraveLineSpacingMM)
		}
	}

	uploadName := ruidaFilename(jobName)
	jobLog.Add("Ruida upload filename: %s", uploadName)

	payload, err := buildRuidaJob(uploadName, layers)
	if err != nil {
		return err
	}
	jobLog.Add("Encoded Ruida payload: %d bytes.", len(payload))
	jobLog.Add("Payload preview: %s", hexPreview(payload, 80))

	log.Printf("[Ruida] Sending %d vector segments in %d layer(s), %d bytes", len(segments), len(layers), len(payload))
	return r.sendPayload(payload, jobLog)
}

func (r *RuidaController) sendPayload(payload []byte, jobLog *JobExecutionLog) error {
	totalChunks := int(math.Ceil(float64(len(payload)) / float64(ruidaChunkSize)))
	jobLog.Add("Sending %d UDP packet(s).", totalChunks)

	for start := 0; start < len(payload); start += ruidaChunkSize {
		end := start + ruidaChunkSize
		if end > len(payload) {
			end = len(payload)
		}

		chunk := payload[start:end]
		sum := 0
		for _, b := range chunk {
			sum += int(b)
		}

		packet := make([]byte, 2+len(chunk))
		packet[0] = byte((sum >> 8) & 0xff)
		packet[1] = byte(sum & 0xff)
		copy(packet[2:], chunk)

		chunkNumber := start/ruidaChunkSize + 1
		jobLog.Add(
			"Packet %d/%d: payload bytes %d-%d, chunk %d bytes, checksum 0x%04x.",
			chunkNumber,
			totalChunks,
			start,
			end-1,
			len(chunk),
			sum&0xffff,
		)

		if err := r.conn.SetDeadline(time.Now().Add(ruidaTimeout)); err != nil {
			return err
		}
		if _, err := r.conn.Write(packet); err != nil {
			return fmt.Errorf("ruida: write packet: %w", err)
		}
		jobLog.Add("Packet %d written, waiting for ACK...", chunkNumber)

		ack := make([]byte, 16)
		n, err := r.conn.Read(ack)
		if err != nil {
			return fmt.Errorf("ruida: waiting for ACK: %w", err)
		}
		if n == 0 {
			return fmt.Errorf("ruida: empty ACK")
		}
		if ack[0] == 0x46 {
			return fmt.Errorf("ruida: controller reported checksum error")
		}
		if ack[0] != 0xc6 {
			return fmt.Errorf("ruida: unexpected ACK byte 0x%02x", ack[0])
		}
		jobLog.Add("Packet %d ACK: 0x%02x (%d byte response).", chunkNumber, ack[0], n)
	}

	return nil
}

func buildRuidaLayers(segments []ruidaSegment, profile MaterialProfile) []ruidaLayer {
	layerMap := map[string]*ruidaLayer{
		"cut": {
			op:       "cut",
			settings: profile.Cut,
			color:    0x0000ff,
		},
		"engrave": {
			op:       "engrave",
			settings: profile.Engrave,
			color:    0x000000,
		},
		"mark": {
			op:       "mark",
			settings: profile.Mark,
			color:    0x00ff00,
		},
	}

	for _, segment := range segments {
		layer, ok := layerMap[segment.op]
		if !ok || segment.op == "ignore" {
			continue
		}
		layer.segments = append(layer.segments, segment)
		layer.bounds.include(segment.from)
		layer.bounds.include(segment.to)
	}

	var layers []ruidaLayer
	for _, name := range []string{"engrave", "mark", "cut"} {
		layer := layerMap[name]
		if len(layer.segments) > 0 {
			layers = append(layers, *layer)
		}
	}
	return layers
}

func buildRuidaJob(jobName string, layers []ruidaLayer) ([]byte, error) {
	stream := &ruidaStream{}
	allBounds := ruidaBounds{}
	for _, layer := range layers {
		allBounds.include(ruidaPoint{layer.bounds.minX, layer.bounds.minY})
		allBounds.include(ruidaPoint{layer.bounds.maxX, layer.bounds.maxY})
	}

	stream.hex("D812")
	stream.hex("F0")
	stream.hex("E802").hex("E701").ascii(jobName).hex("00")
	stream.hex("F10200")
	stream.hex("D800")
	stream.hex("E706").absoluteMM(0).absoluteMM(0)
	stream.writeBounds(allBounds)
	stream.hex("CA22").byteInt(len(layers) - 1)

	totalTravel := int64(0)
	for i, layer := range layers {
		stream.hex("E752").byteInt(i).absoluteMM(layer.bounds.minX).absoluteMM(layer.bounds.minY)
		stream.hex("E753").byteInt(i).absoluteMM(layer.bounds.maxX).absoluteMM(layer.bounds.maxY)
		stream.hex("E761").byteInt(i).absoluteMM(layer.bounds.minX).absoluteMM(layer.bounds.minY)
		stream.hex("E762").byteInt(i).absoluteMM(layer.bounds.maxX).absoluteMM(layer.bounds.maxY)

		minPower, maxPower := layerPowerRange(layer)
		speed := clampInt(layer.settings.Speed, 1, 1000)
		stream.hex("C631").byteInt(i).percent(minPower)
		stream.hex("C632").byteInt(i).percent(maxPower)
		stream.hex("C904").byteInt(i).absoluteMM(float64(speed))
		stream.hex("C660").byteInt(i).hex("00").longInt(20000)
		stream.hex("CA06").byteInt(i).longInt(int64(layer.color))
		layerMode := 0
		startMode := 0
		if layer.op == "engrave" {
			layerMode = 2
			startMode = 1
		}
		stream.hex("CA41").byteInt(i).byteInt(layerMode)

		stream.hex("CA01").byteInt(startMode)
		stream.hex("CA02").byteInt(i)
		stream.hex("CA0113")
		stream.hex("C902").absoluteMM(float64(speed))
		stream.hex("C601").percent(minPower)
		stream.hex("C602").percent(maxPower)
		stream.hex("CA030F")
		stream.hex("CA1000")

		for _, segment := range layer.segments {
			stream.hex("88").absoluteMM(segment.from.x).absoluteMM(segment.from.y)
			stream.hex("A8").absoluteMM(segment.to.x).absoluteMM(segment.to.y)
			totalTravel += int64(math.Round(distance(segment.from, segment.to)))
		}
	}

	stream.hex("DA010620").longInt(totalTravel).longInt(totalTravel)
	stream.hex("E700")
	stream.hex("D7")

	return stream.buf.Bytes(), stream.err()
}

func layerPowerRange(layer ruidaLayer) (int, int) {
	maxPower := clampInt(layer.settings.Power, 0, 100)
	minPower := maxPower
	if layer.op == "mark" && maxPower > 0 {
		minPower = int(math.Round(float64(maxPower) * ruidaMarkMinPowerRatio))
		minPower = clampInt(minPower, 1, maxPower)
	}
	return minPower, maxPower
}

func ruidaFilename(jobName string) string {
	name := strings.TrimSpace(jobName)
	if name == "" {
		name = "rayn-job"
	}

	var builder strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z':
			builder.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			builder.WriteRune(r)
		case r >= '0' && r <= '9':
			builder.WriteRune(r)
		case r == '-' || r == '_':
			builder.WriteRune(r)
		case unicode.IsSpace(r):
			builder.WriteByte('_')
		}
	}

	clean := strings.Trim(builder.String(), "_-.")
	if clean == "" {
		clean = "rayn-job"
	}
	if len(clean) > 28 {
		clean = clean[:28]
	}
	if !strings.HasSuffix(strings.ToLower(clean), ".rd") {
		clean += ".rd"
	}
	return clean
}

func (s *ruidaStream) err() error {
	return nil
}

func (s *ruidaStream) writeByte(b byte) {
	i := int(b)
	i ^= (i >> 7) & 0xff
	i ^= (i << 7) & 0xff
	i ^= (i >> 7) & 0xff
	i ^= 0x88
	i = (i + 1) & 0xff
	s.buf.WriteByte(byte(i))
}

func (s *ruidaStream) hex(value string) *ruidaStream {
	data, err := hex.DecodeString(strings.ReplaceAll(value, " ", ""))
	if err != nil {
		panic(err)
	}
	for _, b := range data {
		s.writeByte(b)
	}
	return s
}

func (s *ruidaStream) byteInt(value int) *ruidaStream {
	s.writeByte(byte(value & 0xff))
	return s
}

func (s *ruidaStream) ascii(value string) *ruidaStream {
	for _, b := range []byte(value) {
		s.byteInt(int(b))
	}
	return s
}

func (s *ruidaStream) absoluteMM(value float64) *ruidaStream {
	return s.longInt(int64(math.Round(value * 1000)))
}

func (s *ruidaStream) longInt(value int64) *ruidaStream {
	mask := int64(0x7f0000000)
	for i := 0; i < 5; i++ {
		shift := uint((4 - i) * 7)
		s.byteInt(int((value & mask) >> shift))
		mask >>= 7
	}
	return s
}

func (s *ruidaStream) percent(value int) *ruidaStream {
	scaled := int(math.Round(float64(value) / 0.0061038881767686))
	if scaled < 0 {
		scaled = 0
	}
	if scaled > 16383 {
		scaled = 16383
	}
	s.byteInt((scaled & 0x3f80) >> 7)
	s.byteInt(scaled & 0x007f)
	return s
}

func (s *ruidaStream) writeBounds(bounds ruidaBounds) {
	s.hex("E703").absoluteMM(bounds.minX).absoluteMM(bounds.minY)
	s.hex("E707").absoluteMM(bounds.maxX).absoluteMM(bounds.maxY)
	s.hex("E750").absoluteMM(bounds.minX).absoluteMM(bounds.minY)
	s.hex("E751").absoluteMM(bounds.maxX).absoluteMM(bounds.maxY)
	s.hex("E7040001000100000000000000000000")
	s.hex("E70500")
}

func parseRuidaSVG(svgData string, options JobOptions) ([]ruidaSegment, error) {
	options = normalizeJobOptions(options)
	decoder := xml.NewDecoder(strings.NewReader(svgData))
	transforms := []ruidaTransform{identityTransform()}
	styles := []ruidaStyle{{}}
	var segments []ruidaSegment
	var fillShapes []ruidaFillShape

	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("ruida: parse SVG: %w", err)
		}

		switch t := token.(type) {
		case xml.StartElement:
			parentTransform := transforms[len(transforms)-1]
			parentStyle := styles[len(styles)-1]
			transform := parentTransform.multiply(parseTransform(attr(t.Attr, "transform")))
			style := mergeStyle(parentStyle, t.Attr)
			transforms = append(transforms, transform)
			styles = append(styles, style)

			op := operationForStyle(style)
			elementSegments, elementFill := parseElementGeometry(t, transform, style, op)
			segments = append(segments, elementSegments...)
			if elementFill.op != "" && len(elementFill.contours) > 0 {
				fillShapes = append(fillShapes, elementFill)
			}

		case xml.EndElement:
			if len(transforms) > 1 {
				transforms = transforms[:len(transforms)-1]
				styles = styles[:len(styles)-1]
			}
		}
	}

	segments = append(segments, hatchFillShapes(fillShapes, options.EngraveLineSpacingMM)...)
	return segments, nil
}

func parseElementGeometry(element xml.StartElement, transform ruidaTransform, style ruidaStyle, op string) ([]ruidaSegment, ruidaFillShape) {
	switch strings.ToLower(element.Name.Local) {
	case "line":
		p1 := transform.apply(ruidaPoint{numberAttr(element.Attr, "x1"), numberAttr(element.Attr, "y1")})
		p2 := transform.apply(ruidaPoint{numberAttr(element.Attr, "x2"), numberAttr(element.Attr, "y2")})
		return []ruidaSegment{{from: p1, to: p2, op: op}}, ruidaFillShape{}

	case "rect":
		x := numberAttr(element.Attr, "x")
		y := numberAttr(element.Attr, "y")
		w := numberAttr(element.Attr, "width")
		h := numberAttr(element.Attr, "height")
		if w <= 0 || h <= 0 {
			return nil, ruidaFillShape{}
		}
		points := transformPoints([]ruidaPoint{{x, y}, {x + w, y}, {x + w, y + h}, {x, y + h}}, transform)
		if shouldScanFill(style, op) {
			return nil, ruidaFillShape{contours: [][]ruidaPoint{points}, op: op}
		}
		return segmentsFromPoints(points, true, identityTransform(), op), ruidaFillShape{}

	case "circle":
		cx := numberAttr(element.Attr, "cx")
		cy := numberAttr(element.Attr, "cy")
		r := numberAttr(element.Attr, "r")
		if r <= 0 {
			return nil, ruidaFillShape{}
		}
		points := transformPoints(ellipsePoints(cx, cy, r, r), transform)
		if shouldScanFill(style, op) {
			return nil, ruidaFillShape{contours: [][]ruidaPoint{points}, op: op}
		}
		return segmentsFromPoints(points, true, identityTransform(), op), ruidaFillShape{}

	case "ellipse":
		cx := numberAttr(element.Attr, "cx")
		cy := numberAttr(element.Attr, "cy")
		rx := numberAttr(element.Attr, "rx")
		ry := numberAttr(element.Attr, "ry")
		if rx <= 0 || ry <= 0 {
			return nil, ruidaFillShape{}
		}
		points := transformPoints(ellipsePoints(cx, cy, rx, ry), transform)
		if shouldScanFill(style, op) {
			return nil, ruidaFillShape{contours: [][]ruidaPoint{points}, op: op}
		}
		return segmentsFromPoints(points, true, identityTransform(), op), ruidaFillShape{}

	case "polyline", "polygon":
		points := transformPoints(parsePointList(attr(element.Attr, "points")), transform)
		closed := strings.EqualFold(element.Name.Local, "polygon")
		if closed && shouldScanFill(style, op) {
			return nil, ruidaFillShape{contours: [][]ruidaPoint{points}, op: op}
		}
		return segmentsFromPoints(points, closed, identityTransform(), op), ruidaFillShape{}

	case "path":
		segments := parsePathSegments(attr(element.Attr, "d"), transform, op)
		if shouldScanFill(style, op) {
			contours := parsePathContours(attr(element.Attr, "d"), transform)
			if len(contours) > 0 {
				return nil, ruidaFillShape{contours: contours, op: op}
			}
		}
		return segments, ruidaFillShape{}
	}

	return nil, ruidaFillShape{}
}

func ellipsePoints(cx, cy, rx, ry float64) []ruidaPoint {
	const minSteps = 24
	const maxSteps = 96

	circumference := math.Pi * (3*(rx+ry) - math.Sqrt((3*rx+ry)*(rx+3*ry)))
	steps := int(math.Ceil(circumference / 0.25))
	if steps < minSteps {
		steps = minSteps
	}
	if steps > maxSteps {
		steps = maxSteps
	}

	points := make([]ruidaPoint, 0, steps)
	for i := 0; i < steps; i++ {
		angle := 2 * math.Pi * float64(i) / float64(steps)
		points = append(points, ruidaPoint{
			x: cx + math.Cos(angle)*rx,
			y: cy + math.Sin(angle)*ry,
		})
	}
	return points
}

func shouldScanFill(style ruidaStyle, op string) bool {
	fill := normalizeColor(strings.ToLower(strings.TrimSpace(style.fill)))
	return op == "engrave" && fill != "" && fill != "none"
}

func transformPoints(points []ruidaPoint, transform ruidaTransform) []ruidaPoint {
	out := make([]ruidaPoint, 0, len(points))
	for _, point := range points {
		out = append(out, transform.apply(point))
	}
	return out
}

func hatchFillShapes(shapes []ruidaFillShape, spacing float64) []ruidaSegment {
	if spacing <= 0 {
		spacing = defaultEngraveLineSpacingMM
	}

	byOperation := make(map[string][][]ruidaPoint)
	for _, shape := range shapes {
		if shape.op == "" {
			continue
		}
		for _, contour := range shape.contours {
			if len(contour) >= 3 {
				byOperation[shape.op] = append(byOperation[shape.op], contour)
			}
		}
	}

	var segments []ruidaSegment
	for op, contours := range byOperation {
		segments = append(segments, hatchContours(contours, op, spacing)...)
	}
	return segments
}

func hatchContours(contours [][]ruidaPoint, op string, spacing float64) []ruidaSegment {
	bounds := ruidaBounds{}
	for _, contour := range contours {
		for _, point := range contour {
			bounds.include(point)
		}
	}
	if !bounds.set || bounds.maxY <= bounds.minY {
		return nil
	}

	var segments []ruidaSegment
	leftToRight := true
	for y := bounds.minY + spacing/2; y < bounds.maxY; y += spacing {
		intersections := contoursIntersectionsAtY(contours, y)
		if len(intersections) < 2 {
			continue
		}

		intervals := make([][2]float64, 0, len(intersections)/2)
		for i := 0; i+1 < len(intersections); i += 2 {
			x1 := intersections[i]
			x2 := intersections[i+1]
			if x2-x1 < ruidaMinimumEngraveLineMM {
				continue
			}
			intervals = append(intervals, [2]float64{x1, x2})
		}
		if len(intervals) == 0 {
			continue
		}
		if !leftToRight {
			for i, j := 0, len(intervals)-1; i < j; i, j = i+1, j-1 {
				intervals[i], intervals[j] = intervals[j], intervals[i]
			}
		}

		for _, interval := range intervals {
			from := ruidaPoint{x: interval[0], y: y}
			to := ruidaPoint{x: interval[1], y: y}
			if !leftToRight {
				from, to = to, from
			}
			segments = append(segments, ruidaSegment{from: from, to: to, op: op})
		}
		leftToRight = !leftToRight
	}

	return segments
}

func contoursIntersectionsAtY(contours [][]ruidaPoint, y float64) []float64 {
	var intersections []float64
	for _, contour := range contours {
		intersections = append(intersections, polygonIntersectionsAtY(contour, y)...)
	}
	sort.Float64s(intersections)
	return intersections
}

func polygonIntersectionsAtY(points []ruidaPoint, y float64) []float64 {
	var intersections []float64
	for i := range points {
		a := points[i]
		b := points[(i+1)%len(points)]
		if math.Abs(a.y-b.y) < 0.000001 {
			continue
		}
		if y < math.Min(a.y, b.y) || y >= math.Max(a.y, b.y) {
			continue
		}

		t := (y - a.y) / (b.y - a.y)
		intersections = append(intersections, a.x+t*(b.x-a.x))
	}
	sort.Float64s(intersections)
	return intersections
}

func segmentsFromPoints(points []ruidaPoint, closed bool, transform ruidaTransform, op string) []ruidaSegment {
	if len(points) < 2 {
		return nil
	}

	out := make([]ruidaSegment, 0, len(points))
	for i := 0; i < len(points)-1; i++ {
		out = append(out, ruidaSegment{from: transform.apply(points[i]), to: transform.apply(points[i+1]), op: op})
	}
	if closed {
		out = append(out, ruidaSegment{from: transform.apply(points[len(points)-1]), to: transform.apply(points[0]), op: op})
	}
	return out
}

func parsePathSegments(d string, transform ruidaTransform, op string) []ruidaSegment {
	tokens := tokenizePath(d)
	var out []ruidaSegment
	var cmd byte
	var current ruidaPoint
	var start ruidaPoint
	i := 0

	nextNumber := func() (float64, bool) {
		if i >= len(tokens) || isPathCommand(tokens[i]) {
			return 0, false
		}
		value, err := strconv.ParseFloat(tokens[i], 64)
		if err != nil {
			return 0, false
		}
		i++
		return value, true
	}

	for i < len(tokens) {
		if isPathCommand(tokens[i]) {
			cmd = tokens[i][0]
			i++
		}
		if cmd == 0 {
			break
		}

		relative := unicode.IsLower(rune(cmd))
		switch unicode.ToUpper(rune(cmd)) {
		case 'M':
			x, okX := nextNumber()
			y, okY := nextNumber()
			if !okX || !okY {
				return out
			}
			current = makePoint(x, y, current, relative)
			start = current
			cmd = byte(map[bool]rune{true: 'l', false: 'L'}[relative])

		case 'L':
			for {
				x, okX := nextNumber()
				y, okY := nextNumber()
				if !okX || !okY {
					break
				}
				next := makePoint(x, y, current, relative)
				out = append(out, ruidaSegment{from: transform.apply(current), to: transform.apply(next), op: op})
				current = next
			}

		case 'H':
			for {
				x, ok := nextNumber()
				if !ok {
					break
				}
				next := current
				if relative {
					next.x += x
				} else {
					next.x = x
				}
				out = append(out, ruidaSegment{from: transform.apply(current), to: transform.apply(next), op: op})
				current = next
			}

		case 'V':
			for {
				y, ok := nextNumber()
				if !ok {
					break
				}
				next := current
				if relative {
					next.y += y
				} else {
					next.y = y
				}
				out = append(out, ruidaSegment{from: transform.apply(current), to: transform.apply(next), op: op})
				current = next
			}

		case 'C':
			for {
				x1, ok1 := nextNumber()
				y1, ok2 := nextNumber()
				x2, ok3 := nextNumber()
				y2, ok4 := nextNumber()
				x, ok5 := nextNumber()
				y, ok6 := nextNumber()
				if !(ok1 && ok2 && ok3 && ok4 && ok5 && ok6) {
					break
				}
				p1 := makePoint(x1, y1, current, relative)
				p2 := makePoint(x2, y2, current, relative)
				p3 := makePoint(x, y, current, relative)
				out = append(out, cubicSegments(current, p1, p2, p3, transform, op)...)
				current = p3
			}

		case 'Q':
			for {
				x1, ok1 := nextNumber()
				y1, ok2 := nextNumber()
				x, ok3 := nextNumber()
				y, ok4 := nextNumber()
				if !(ok1 && ok2 && ok3 && ok4) {
					break
				}
				p1 := makePoint(x1, y1, current, relative)
				p2 := makePoint(x, y, current, relative)
				out = append(out, quadSegments(current, p1, p2, transform, op)...)
				current = p2
			}

		case 'Z':
			out = append(out, ruidaSegment{from: transform.apply(current), to: transform.apply(start), op: op})
			current = start
		default:
			return out
		}
	}

	return out
}

func parsePathContours(d string, transform ruidaTransform) [][]ruidaPoint {
	tokens := tokenizePath(d)
	var contours [][]ruidaPoint
	var contour []ruidaPoint
	var cmd byte
	var current ruidaPoint
	var start ruidaPoint
	i := 0

	nextNumber := func() (float64, bool) {
		if i >= len(tokens) || isPathCommand(tokens[i]) {
			return 0, false
		}
		value, err := strconv.ParseFloat(tokens[i], 64)
		if err != nil {
			return 0, false
		}
		i++
		return value, true
	}

	finishContour := func() {
		if len(contour) >= 3 {
			first := contour[0]
			last := contour[len(contour)-1]
			if distance(first, last) <= 0.001 {
				contour = contour[:len(contour)-1]
			}
			if len(contour) >= 3 {
				contours = append(contours, contour)
			}
		}
		contour = nil
	}

	appendPoint := func(point ruidaPoint) {
		transformed := transform.apply(point)
		if len(contour) == 0 || distance(contour[len(contour)-1], transformed) > 0.001 {
			contour = append(contour, transformed)
		}
	}

	for i < len(tokens) {
		if isPathCommand(tokens[i]) {
			cmd = tokens[i][0]
			i++
		}
		if cmd == 0 {
			break
		}

		relative := unicode.IsLower(rune(cmd))
		switch unicode.ToUpper(rune(cmd)) {
		case 'M':
			x, okX := nextNumber()
			y, okY := nextNumber()
			if !okX || !okY {
				finishContour()
				return contours
			}
			finishContour()
			current = makePoint(x, y, current, relative)
			start = current
			appendPoint(current)
			cmd = byte(map[bool]rune{true: 'l', false: 'L'}[relative])

		case 'L':
			for {
				x, okX := nextNumber()
				y, okY := nextNumber()
				if !okX || !okY {
					break
				}
				current = makePoint(x, y, current, relative)
				appendPoint(current)
			}

		case 'H':
			for {
				x, ok := nextNumber()
				if !ok {
					break
				}
				if relative {
					current.x += x
				} else {
					current.x = x
				}
				appendPoint(current)
			}

		case 'V':
			for {
				y, ok := nextNumber()
				if !ok {
					break
				}
				if relative {
					current.y += y
				} else {
					current.y = y
				}
				appendPoint(current)
			}

		case 'C':
			for {
				x1, ok1 := nextNumber()
				y1, ok2 := nextNumber()
				x2, ok3 := nextNumber()
				y2, ok4 := nextNumber()
				x, ok5 := nextNumber()
				y, ok6 := nextNumber()
				if !(ok1 && ok2 && ok3 && ok4 && ok5 && ok6) {
					break
				}
				p0 := current
				p1 := makePoint(x1, y1, current, relative)
				p2 := makePoint(x2, y2, current, relative)
				p3 := makePoint(x, y, current, relative)
				for step := 1; step <= 24; step++ {
					t := float64(step) / 24
					appendPoint(ruidaPoint{
						x: math.Pow(1-t, 3)*p0.x + 3*math.Pow(1-t, 2)*t*p1.x + 3*(1-t)*t*t*p2.x + t*t*t*p3.x,
						y: math.Pow(1-t, 3)*p0.y + 3*math.Pow(1-t, 2)*t*p1.y + 3*(1-t)*t*t*p2.y + t*t*t*p3.y,
					})
				}
				current = p3
			}

		case 'Q':
			for {
				x1, ok1 := nextNumber()
				y1, ok2 := nextNumber()
				x, ok3 := nextNumber()
				y, ok4 := nextNumber()
				if !(ok1 && ok2 && ok3 && ok4) {
					break
				}
				p0 := current
				p1 := makePoint(x1, y1, current, relative)
				p2 := makePoint(x, y, current, relative)
				for step := 1; step <= 18; step++ {
					t := float64(step) / 18
					appendPoint(ruidaPoint{
						x: (1-t)*(1-t)*p0.x + 2*(1-t)*t*p1.x + t*t*p2.x,
						y: (1-t)*(1-t)*p0.y + 2*(1-t)*t*p1.y + t*t*p2.y,
					})
				}
				current = p2
			}

		case 'Z':
			appendPoint(start)
			current = start
			finishContour()

		default:
			finishContour()
			return contours
		}
	}

	finishContour()
	return contours
}

func cubicSegments(p0, p1, p2, p3 ruidaPoint, transform ruidaTransform, op string) []ruidaSegment {
	const steps = 16
	out := make([]ruidaSegment, 0, steps)
	prev := p0
	for i := 1; i <= steps; i++ {
		t := float64(i) / steps
		next := ruidaPoint{
			x: math.Pow(1-t, 3)*p0.x + 3*math.Pow(1-t, 2)*t*p1.x + 3*(1-t)*t*t*p2.x + t*t*t*p3.x,
			y: math.Pow(1-t, 3)*p0.y + 3*math.Pow(1-t, 2)*t*p1.y + 3*(1-t)*t*t*p2.y + t*t*t*p3.y,
		}
		out = append(out, ruidaSegment{from: transform.apply(prev), to: transform.apply(next), op: op})
		prev = next
	}
	return out
}

func quadSegments(p0, p1, p2 ruidaPoint, transform ruidaTransform, op string) []ruidaSegment {
	const steps = 12
	out := make([]ruidaSegment, 0, steps)
	prev := p0
	for i := 1; i <= steps; i++ {
		t := float64(i) / steps
		next := ruidaPoint{
			x: (1-t)*(1-t)*p0.x + 2*(1-t)*t*p1.x + t*t*p2.x,
			y: (1-t)*(1-t)*p0.y + 2*(1-t)*t*p1.y + t*t*p2.y,
		}
		out = append(out, ruidaSegment{from: transform.apply(prev), to: transform.apply(next), op: op})
		prev = next
	}
	return out
}

func tokenizePath(d string) []string {
	var tokens []string
	for i := 0; i < len(d); {
		r := rune(d[i])
		if unicode.IsSpace(r) || d[i] == ',' {
			i++
			continue
		}
		if isPathCommand(string(d[i])) {
			tokens = append(tokens, string(d[i]))
			i++
			continue
		}

		start := i
		i++
		for i < len(d) {
			c := d[i]
			if isPathCommand(string(c)) || unicode.IsSpace(rune(c)) || c == ',' {
				break
			}
			if (c == '-' || c == '+') && d[i-1] != 'e' && d[i-1] != 'E' {
				break
			}
			i++
		}
		tokens = append(tokens, d[start:i])
	}
	return tokens
}

func isPathCommand(token string) bool {
	if len(token) != 1 {
		return false
	}
	return strings.ContainsRune("MmLlHhVvCcQqZz", rune(token[0]))
}

func makePoint(x, y float64, current ruidaPoint, relative bool) ruidaPoint {
	if relative {
		return ruidaPoint{current.x + x, current.y + y}
	}
	return ruidaPoint{x, y}
}

func parsePointList(value string) []ruidaPoint {
	fields := strings.FieldsFunc(value, func(r rune) bool {
		return unicode.IsSpace(r) || r == ','
	})
	var points []ruidaPoint
	for i := 0; i+1 < len(fields); i += 2 {
		x, errX := strconv.ParseFloat(fields[i], 64)
		y, errY := strconv.ParseFloat(fields[i+1], 64)
		if errX == nil && errY == nil {
			points = append(points, ruidaPoint{x, y})
		}
	}
	return points
}

func mergeStyle(parent ruidaStyle, attrs []xml.Attr) ruidaStyle {
	style := parent
	if value := attr(attrs, "stroke"); value != "" {
		style.stroke = value
	}
	if value := attr(attrs, "fill"); value != "" {
		style.fill = value
	}
	for _, part := range strings.Split(attr(attrs, "style"), ";") {
		key, value, ok := strings.Cut(part, ":")
		if !ok {
			continue
		}
		switch strings.TrimSpace(strings.ToLower(key)) {
		case "stroke":
			style.stroke = strings.TrimSpace(value)
		case "fill":
			style.fill = strings.TrimSpace(value)
		}
	}
	return style
}

func operationForStyle(style ruidaStyle) string {
	color := strings.ToLower(strings.TrimSpace(style.stroke))
	if color == "" || color == "none" {
		color = strings.ToLower(strings.TrimSpace(style.fill))
	}
	color = normalizeColor(color)

	switch color {
	case "#0000ff", "blue":
		return "ignore"
	case "#00ff00", "#008000", "green":
		return "mark"
	case "#000000", "black":
		return "engrave"
	case "#ff0000", "red":
		return "cut"
	default:
		return "cut"
	}
}

func normalizeColor(color string) string {
	if strings.HasPrefix(color, "rgb(") && strings.HasSuffix(color, ")") {
		parts := strings.FieldsFunc(strings.TrimSuffix(strings.TrimPrefix(color, "rgb("), ")"), func(r rune) bool {
			return r == ',' || unicode.IsSpace(r)
		})
		if len(parts) >= 3 {
			r, _ := strconv.Atoi(parts[0])
			g, _ := strconv.Atoi(parts[1])
			b, _ := strconv.Atoi(parts[2])
			return fmt.Sprintf("#%02x%02x%02x", clampInt(r, 0, 255), clampInt(g, 0, 255), clampInt(b, 0, 255))
		}
	}
	if strings.HasPrefix(color, "#") && len(color) == 4 {
		return fmt.Sprintf("#%c%c%c%c%c%c", color[1], color[1], color[2], color[2], color[3], color[3])
	}
	return color
}

func parseTransform(value string) ruidaTransform {
	result := identityTransform()
	for len(strings.TrimSpace(value)) > 0 {
		value = strings.TrimSpace(value)
		open := strings.IndexByte(value, '(')
		close := strings.IndexByte(value, ')')
		if open < 0 || close < open {
			break
		}
		name := strings.ToLower(strings.TrimSpace(value[:open]))
		args := parseNumberList(value[open+1 : close])
		value = value[close+1:]

		switch name {
		case "matrix":
			if len(args) >= 6 {
				result = result.multiply(ruidaTransform{args[0], args[1], args[2], args[3], args[4], args[5]})
			}
		case "translate":
			if len(args) == 0 {
				continue
			}
			tx := args[0]
			ty := 0.0
			if len(args) > 1 {
				ty = args[1]
			}
			result = result.multiply(ruidaTransform{1, 0, 0, 1, tx, ty})
		case "scale":
			if len(args) == 0 {
				continue
			}
			sx := args[0]
			sy := sx
			if len(args) > 1 {
				sy = args[1]
			}
			result = result.multiply(ruidaTransform{sx, 0, 0, sy, 0, 0})
		case "rotate":
			if len(args) >= 1 {
				angle := args[0] * math.Pi / 180
				rot := ruidaTransform{math.Cos(angle), math.Sin(angle), -math.Sin(angle), math.Cos(angle), 0, 0}
				if len(args) >= 3 {
					cx, cy := args[1], args[2]
					result = result.multiply(ruidaTransform{1, 0, 0, 1, cx, cy}).multiply(rot).multiply(ruidaTransform{1, 0, 0, 1, -cx, -cy})
				} else {
					result = result.multiply(rot)
				}
			}
		}
	}
	return result
}

func parseNumberList(value string) []float64 {
	fields := strings.FieldsFunc(value, func(r rune) bool {
		return unicode.IsSpace(r) || r == ','
	})
	numbers := make([]float64, 0, len(fields))
	for _, field := range fields {
		if number, err := strconv.ParseFloat(field, 64); err == nil {
			numbers = append(numbers, number)
		}
	}
	return numbers
}

func identityTransform() ruidaTransform {
	return ruidaTransform{a: 1, d: 1}
}

func (t ruidaTransform) multiply(o ruidaTransform) ruidaTransform {
	return ruidaTransform{
		a: t.a*o.a + t.c*o.b,
		b: t.b*o.a + t.d*o.b,
		c: t.a*o.c + t.c*o.d,
		d: t.b*o.c + t.d*o.d,
		e: t.a*o.e + t.c*o.f + t.e,
		f: t.b*o.e + t.d*o.f + t.f,
	}
}

func (t ruidaTransform) apply(p ruidaPoint) ruidaPoint {
	return ruidaPoint{
		x: t.a*p.x + t.c*p.y + t.e,
		y: t.b*p.x + t.d*p.y + t.f,
	}
}

func (b *ruidaBounds) include(point ruidaPoint) {
	if !b.set {
		b.minX = point.x
		b.maxX = point.x
		b.minY = point.y
		b.maxY = point.y
		b.set = true
		return
	}
	b.minX = math.Min(b.minX, point.x)
	b.minY = math.Min(b.minY, point.y)
	b.maxX = math.Max(b.maxX, point.x)
	b.maxY = math.Max(b.maxY, point.y)
}

func distance(a, b ruidaPoint) float64 {
	return math.Hypot(a.x-b.x, a.y-b.y)
}

func attr(attrs []xml.Attr, name string) string {
	for _, attr := range attrs {
		if strings.EqualFold(attr.Name.Local, name) {
			return attr.Value
		}
	}
	return ""
}

func numberAttr(attrs []xml.Attr, name string) float64 {
	value, _ := strconv.ParseFloat(attr(attrs, name), 64)
	return value
}

func clampInt(value, minValue, maxValue int) int {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func hexPreview(data []byte, limit int) string {
	if len(data) == 0 {
		return "<empty>"
	}
	if len(data) > limit {
		return fmt.Sprintf("%s ... (%d bytes total)", hex.EncodeToString(data[:limit]), len(data))
	}
	return hex.EncodeToString(data)
}
