#!/usr/bin/env bash
set -euo pipefail

APP_NAME="rayn"
DISPLAY_NAME="Rayn"
VERSION="${VERSION:-0.0.0}"
ARCH="${ARCH:-amd64}"
APPIMAGE_ARCH="x86_64"
BIN_PATH="build/bin/${APP_NAME}"
ICON_PATH="build/appicon.png"
DIST_DIR="dist"

if [[ ! -f "${BIN_PATH}" ]]; then
  echo "Missing binary: ${BIN_PATH}" >&2
  exit 1
fi

if [[ ! -f "${ICON_PATH}" ]]; then
  echo "Missing icon: ${ICON_PATH}" >&2
  exit 1
fi

rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

DESKTOP_ENTRY="[Desktop Entry]
Name=${DISPLAY_NAME}
Exec=${APP_NAME}
Icon=${APP_NAME}
Type=Application
Categories=Graphics;Engineering;
Terminal=false"

DEB_ROOT="${DIST_DIR}/deb-root"
install -Dm755 "${BIN_PATH}" "${DEB_ROOT}/usr/bin/${APP_NAME}"
install -Dm644 "${ICON_PATH}" "${DEB_ROOT}/usr/share/icons/hicolor/256x256/apps/${APP_NAME}.png"
install -Dm644 /dev/stdin "${DEB_ROOT}/usr/share/applications/${APP_NAME}.desktop" <<< "${DESKTOP_ENTRY}"

mkdir -p "${DEB_ROOT}/DEBIAN"
cat > "${DEB_ROOT}/DEBIAN/control" <<EOF
Package: ${APP_NAME}
Version: ${VERSION}
Section: graphics
Priority: optional
Architecture: ${ARCH}
Maintainer: thore <thore.mueller07@gmail.com>
Depends: libgtk-3-0, libwebkit2gtk-4.1-0, libayatana-appindicator3-1 | libappindicator3-1, librsvg2-2
Description: Laser job preparation and Ruida sender for FabLab workflows
 Rayn imports SVG files, prepares laser operations, and sends jobs to supported laser cutters.
EOF

dpkg-deb --build "${DEB_ROOT}" "${DIST_DIR}/${APP_NAME}_${VERSION}_${ARCH}.deb"

APPDIR="${DIST_DIR}/${DISPLAY_NAME}.AppDir"
install -Dm755 "${BIN_PATH}" "${APPDIR}/usr/bin/${APP_NAME}"
install -Dm644 "${ICON_PATH}" "${APPDIR}/usr/share/icons/hicolor/256x256/apps/${APP_NAME}.png"
install -Dm644 /dev/stdin "${APPDIR}/usr/share/applications/${APP_NAME}.desktop" <<< "${DESKTOP_ENTRY}"
cp "${APPDIR}/usr/share/applications/${APP_NAME}.desktop" "${APPDIR}/${APP_NAME}.desktop"
cp "${ICON_PATH}" "${APPDIR}/${APP_NAME}.png"

cat > "${APPDIR}/AppRun" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
HERE="$(dirname "$(readlink -f "$0")")"
exec "${HERE}/usr/bin/rayn" "$@"
EOF
chmod +x "${APPDIR}/AppRun"

APPIMAGETOOL="${DIST_DIR}/appimagetool-${APPIMAGE_ARCH}.AppImage"
curl -L \
  -o "${APPIMAGETOOL}" \
  "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-${APPIMAGE_ARCH}.AppImage"
chmod +x "${APPIMAGETOOL}"

ARCH="${APPIMAGE_ARCH}" \
VERSION="${VERSION}" \
APPIMAGE_EXTRACT_AND_RUN=1 \
  "${APPIMAGETOOL}" "${APPDIR}" "${DIST_DIR}/${DISPLAY_NAME}-${VERSION}-${APPIMAGE_ARCH}.AppImage"

rm -rf "${DEB_ROOT}" "${APPDIR}" "${APPIMAGETOOL}"
