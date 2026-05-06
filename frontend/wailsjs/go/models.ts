export namespace main {
	
	export class ColorMapping {
	    colorHex: string;
	    speed: number;
	    power: number;
	    minPower: number;
	    maxPower: number;
	
	    static createFrom(source: any = {}) {
	        return new ColorMapping(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.colorHex = source["colorHex"];
	        this.speed = source["speed"];
	        this.power = source["power"];
	        this.minPower = source["minPower"];
	        this.maxPower = source["maxPower"];
	    }
	}
	export class FileResponse {
	    fileName: string;
	    content: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new FileResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fileName = source["fileName"];
	        this.content = source["content"];
	        this.error = source["error"];
	    }
	}
	export class Laser {
	    id: string;
	    name: string;
	    ipAddress: string;
	    port: number;
	    protocol: string;
	    machineType: string;
	    imageData: string;
	    bedWidth: number;
	    bedHeight: number;
	    powerMode: string;
	
	    static createFrom(source: any = {}) {
	        return new Laser(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.ipAddress = source["ipAddress"];
	        this.port = source["port"];
	        this.protocol = source["protocol"];
	        this.machineType = source["machineType"];
	        this.imageData = source["imageData"];
	        this.bedWidth = source["bedWidth"];
	        this.bedHeight = source["bedHeight"];
	        this.powerMode = source["powerMode"];
	    }
	}
	export class OperationSettings {
	    speed: number;
	    power: number;
	
	    static createFrom(source: any = {}) {
	        return new OperationSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.speed = source["speed"];
	        this.power = source["power"];
	    }
	}
	export class MaterialThicknessSettings {
	    id: string;
	    thickness: number;
	    cut: OperationSettings;
	    engrave: OperationSettings;
	    mark: OperationSettings;
	
	    static createFrom(source: any = {}) {
	        return new MaterialThicknessSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.thickness = source["thickness"];
	        this.cut = this.convertValues(source["cut"], OperationSettings);
	        this.engrave = this.convertValues(source["engrave"], OperationSettings);
	        this.mark = this.convertValues(source["mark"], OperationSettings);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MaterialProfile {
	    id: string;
	    laserId: string;
	    name: string;
	    thicknesses: MaterialThicknessSettings[];
	    cut: OperationSettings;
	    engrave: OperationSettings;
	    mark: OperationSettings;
	
	    static createFrom(source: any = {}) {
	        return new MaterialProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.laserId = source["laserId"];
	        this.name = source["name"];
	        this.thicknesses = this.convertValues(source["thicknesses"], MaterialThicknessSettings);
	        this.cut = this.convertValues(source["cut"], OperationSettings);
	        this.engrave = this.convertValues(source["engrave"], OperationSettings);
	        this.mark = this.convertValues(source["mark"], OperationSettings);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class Profile {
	    id: string;
	    name: string;
	    materialThickness: number;
	    mappings: ColorMapping[];
	
	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.materialThickness = source["materialThickness"];
	        this.mappings = this.convertValues(source["mappings"], ColorMapping);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

