function importMagic(file) {

  /*
   * Function importMagic
   * Imports demagnetization data from the MagIC format
   * Assume tab delimited
   */

  const MAGIC_TABLE_DELIMITER = ">>>>>>>>>>";

  var tables = file.data.split(MAGIC_TABLE_DELIMITER);

  var magicSpecimens = new Object();
  var magicSamples = new Object();

  // Get a list of the available tables
  var availableTables = tables.map(function(section) {
    return section.split(/\r?\n/).filter(Boolean)[0].split(/\t/)[1];
  });

  // Check if all required measurements are available
  if(!availableTables.includes("samples")) {
    throw(new Exception("MagIC file does not included samples and cannot be shown."));
  }

  if(!availableTables.includes("specimens")) {
    throw(new Exception("MagIC file does not included specimens and cannot be shown."));
  }

  if(!availableTables.includes("measurements")) {
    throw(new Exception("MagIC file does not included measurements and cannot be shown."));
  }

  // Go over each table
  tables.forEach(function(section) {

    var lines = section.split(/\r?\n/).filter(Boolean);
    var sectionHeader = lines[0].split(/\t/);
    var header = lines[1].split(/\t/);

    var tableName = sectionHeader[1]

    switch(tableName) {
      case "locations":
        return;
      case "sites":

        return lines.slice(2).forEach(function(x) {
          var site = parseSite(header, x);
        });

      case "samples":

        return lines.slice(2).forEach(function(x) {
        
          var entry = parseSample(header, x);
        
          magicSamples[entry.name] = {
            "azimuth": entry.azimuth,
            "dip": entry.dip,
            "lat": entry.lat,
            "lng": entry.lng
          }
        
        });

      case "specimens":

        return lines.slice(2).forEach(function(x) {
        
          var specimen = parseSpecimen(header, x);
        
          if(!magicSamples.hasOwnProperty(specimen.sample)) {
            return;
          }
        
          var sample = magicSamples[specimen.sample];
        
          magicSpecimens[specimen.name] = {
            "demagnetizationType": null,
            "coordinates": "specimen",
            "format": "MAGIC",
            "version": __VERSION__,
            "created": new Date().toISOString(),
            "steps": new Array(),
            "level": 0,
            "location": {
              "lat": sample.lat,
              "lng": sample.lng,
            },
            "age": null,
            "lithology": null,
            "name": specimen.name,
            "volume": 10,
            "beddingStrike": Number(0),
            "beddingDip": Number(0),
            "coreAzimuth": sample.azimuth,
            "coreDip": sample.dip,
            "interpretations": new Array()
          }
        
        });

      case "measurements":

        return lines.slice(2).forEach(function(x) {
        
          var measurement = parseMeasurement(header, x);
        
          if(measurement === null) {
            return;
          }
        
          if(!magicSpecimens.hasOwnProperty(measurement.specimen)) {
            throw("Stop!")
          }
        
          magicSpecimens[measurement.specimen].steps.push(new Measurement(measurement.step, measurement.coordinates, 0));
        
        });

    }

  });

  // Add all specimens read from the MagIC file to the application
  Object.values(magicSpecimens).forEach(function(specimen) {

    // Somehow we could not extract steps
    if(specimen.steps.length === 0) {
      return;
    }

    specimens.push(specimen);

  });

}

function parseEntry(header, x) {

  /*
   * Function parseEntry
   * Parses tab delimited table with a header to an object
   */

  var object = new Object();
  var parameters = x.split(/\t/);

  parameters.forEach(function(parameter, i) {
    object[header[i]] = parameters[i];
  });

  return object;

}

function parseSite(header, x) {

  var object = parseEntry(header, x);

  return {
    "name": object.site
  }

}

function parseSample(header, x) {

  var object = parseEntry(header, x);

  var longitude = Number(object.lon);
  if(longitude > 180) {
    longitude -= 360;
  }

  var latitude = Number(object.lat);
  if(latitude > 90) {
    latitude -= 180;
  }

  return {
    "name": object.sample,
    "azimuth": Number(object.azimuth),
    "dip": Number(object.dip),
    "lat": latitude,
    "lng": longitude
  }

}

function parseSpecimen(header, x) {

  var object = parseEntry(header, x);

  return {
    "name": object.specimen,
    "sample": object.sample
  }

}

function parseMeasurement(header, x) {

  var object = parseEntry(header, x);

  var specimen = object.specimen;
  var types = object["method_codes"].split(":");
  var coordinates = new Direction(object["dir_dec"], object["dir_inc"], 1E9 * object["magn_moment"]).toCartesian();

  // Step wise field demagnetization
  if(types.includes("LP-DIR-AF")) {
    return {
      "specimen": specimen,
      "step": object["treat_ac_field"],
      "coordinates": coordinates
    }
  }

  // Thermal (in K)
  if(types.includes("LP-DIR-T")) {
    return {
      "specimen": specimen,
      "step": (Number(object["treat_temp"]) - 273).toString(),
      "coordinates": coordinates
    }
  }

  return null;

}

function importPaleoMac(file) {

  /*
   * Function importPaleoMac
   * Import parser for the PaleoMac format
   */

  // Get lines in the file
  var lines = file.data.split(/\r?\n/).slice(1).filter(Boolean);

  // The line container all the header information
  var header = lines[0].split(/[,\s\t]+/);
  var sampleName = header[0];
	
  // Get header values
  // values will be [a, b, s, d, [v]]
  var parameters = lines[0].split("=");
  var values = new Array();

  for(var i = 1; i < parameters.length; i++) {
    var value = parameters[i].match(/[+-]?\d+(\.\d+)?/g);
    values.push(value);
  }

  // Get the sample volume from file or default to 10cc
  var sampleVolume = Math.abs(Number(values[4][0]) * Math.pow(10, Number(values[4][1])));

  // core hade is measured, we use the plunge (90 - hade)
  var coreAzimuth = Number(values[0]);	
  var coreDip = 90 - Number(values[1]);
  var beddingStrike = Number(values[2]);
  var beddingDip = Number(values[3]);

  // Skip first two and last line
  var steps = lines.slice(2, -1).map(function(line) {

    // Empty parameters as 0
    var parameters = line.split(/[,\s\t]+/);

    // Get the measurement parameters
    var step = parameters[0];
    var x = 1E6 * Number(parameters[1]) / sampleVolume;
    var y = 1E6 * Number(parameters[2]) / sampleVolume;
    var z = 1E6 * Number(parameters[3]) / sampleVolume;
    var a95 = Number(parameters[9]);

    var coordinates = new Coordinates(x, y, z);

    // Skip these (intensity = 0)
    if(Number(parameters[4]) === 0) {
      return null;
    }

    return new Measurement(step, coordinates, a95);

  });

  // Add the data to the application
  specimens.push({
    "demagnetizationType": null,
    "coordinates": "specimen",
    "format": "PALEOMAC",
    "version": __VERSION__,
    "created": new Date().toISOString(),
    "steps": steps,
    "level": 0,
    "location": null,
    "age": null,
    "lithology": null,
    "name": sampleName,
    "volume": 1E6 * sampleVolume,
    "beddingStrike": Number(beddingStrike),
    "beddingDip": Number(beddingDip),
    "coreAzimuth": Number(coreAzimuth),
    "coreDip": Number(coreDip),
    "interpretations": new Array()
  });

}


function importOxford(file) {

  /*
   * Function importOxford
   * Parses files from the Oxford format
   */

  var lines = file.data.split(/\r?\n/).filter(Boolean);
  var parsedData = new Array();
 
  // Get specimen metadata from the first second line
  var parameters = lines[2].split(/[\t]+/);

  var coreAzimuth = Number(parameters[13]);
  var coreDip = Number(parameters[14]);
  
  var beddingStrike = (Number(parameters[15]) + 270) % 360;
  var beddingDip = Number(parameters[16]);
  
  var sampleName = parameters[0];
  var sampleVolume = Math.abs(Number(parameters[18]));

  // Determine what column to use
  // Assume anything with 'Thermal' is TH, and 'Degauss' is AF.
  if(/Thermal/.test(parameters[2])) {
    var stepIndex = 4;
    var demagnetizationType = "thermal";
  } else if(/Degauss/.test(parameters[2])) {
    var stepIndex = 3;
    var demagnetizationType = "alternating";
  } else {
    throw(new Exception("Could not determine type of demagnetization."));
  }
  
  var steps = lines.slice(1).map(function(line) {
	
    // Oxford is delimted by tabs
    var parameters = line.split(/[\t]+/);
    
    var intensity = 1E6 * Number(parameters[6]) / sampleVolume;
    var dec = Number(parameters[11]);
    var inc = Number(parameters[12]);

    var coordinates = new Direction(dec, inc, intensity).toCartesian();

    return new Measurement(parameters[stepIndex], coordinates, null);

  });
 
  // Add the data to the application
  specimens.push({
    "demagnetizationType": demagnetizationType,
    "coordinates": "specimen",
    "format": "OXFORD",
    "version": __VERSION__,
    "created": new Date().toISOString(),
    "steps": steps,
    "level": 0,
    "location": null,
    "age": null,
    "lithology": null,
    "name": sampleName,
    "volume": Number(sampleVolume),
    "beddingStrike": Number(beddingStrike),
    "beddingDip": Number(beddingDip),
    "coreAzimuth": Number(coreAzimuth),
    "coreDip": Number(coreDip),
    "interpretations": new Array()
  });
    
}


function importNGU(file) {

  /*
   * Function importNGU
   * Parser for the NGU format
   */

  var lines = file.data.split(/\r?\n/).filter(Boolean);
  var parsedData = new Array();

  for(var i = 0; i < lines.length; i++) {

    // Reduce empty lines
    var parameters = lines[i].split(/[,\s\t]+/);
    parameters = parameters.filter(function(x) {
      return x !== "";
    });

    // Get the header
    if(i === 0) {

      var sampleName = parameters[0];

      // Different convention for core orientation than Utrecht
      var coreAzimuth = Number(parameters[1]);
      var coreDip = 90 - Number(parameters[2]);

      // Bedding strike needs to be decreased by 90 for input convention
      var beddingStrike = (Number(parameters[3]) + 270) % 360;
      var beddingDip = Number(parameters[4]);
      var info = parameters[5];

    } else {

      // Get Cartesian coordinates for specimen coordinates (intensities in mA -> bring to μA)
      var intensity = 1E3 * Number(parameters[1]);
      var dec = Number(parameters[2]);
      var inc = Number(parameters[3]);

      var coordinates = new Direction(dec, inc, intensity).toCartesian();

      parsedData.push(new Measurement(parameters[0], coordinates, Number(parameters[4])));

    }
  }

  specimens.push({
    "demagnetizationType": null,
    "coordinates": "specimen",
    "format": "NGU",
    "version": __VERSION__,
    "created": new Date().toISOString(),
    "steps": parsedData,
    "name": sampleName,
    "volume": null,
    "level": 0,
    "location": null,
    "age": null,
    "lithology": null,
    "beddingStrike": Number(beddingStrike),
    "beddingDip": Number(beddingDip),
    "coreAzimuth": Number(coreAzimuth),
    "coreDip": Number(coreDip),
    "interpretations": new Array()
  });

}

function importCenieh(file) {

  /*
   * Function importCenieh
   * Imports files from the Cenieh format (no core, bedding parameters available)
   */
  
  // Cenieh samples need to be sorted
  var ceniehSpecimens = new Object();

  var lines = file.data.split(/\r?\n/).filter(Boolean);
 
  // Skip the header
  lines.slice(1).forEach(function(line) {

	var parameters = line.split(/\s+/);
	var level = parameters[13];

    // Add the level to the sample name
	var sampleName = parameters[0] + "." + level;

    // Add a sample to the has map
	if(!ceniehSpecimens.hasOwnProperty(sampleName)) {

	  ceniehSpecimens[sampleName] = {
        "demagnetizationType": null,
        "coordinates": "specimen",
        "format": "CENIEH",
        "version": __VERSION__,
        "created": new Date().toISOString(),
        "steps": new Array(),
        "name": sampleName,
        "volume": null,
        "level": level,
        "location": null,
        "age": null,
        "lithology": null,
        "beddingStrike": 270,
        "beddingDip": 0,
        "coreAzimuth": 0,
        "coreDip": 90,
        "interpretations": new Array()
	  }

    }

    // Extract the measurement parameters
	var step = parameters[1];
	var intensity = Number(parameters[2]);	
	var declination = Number(parameters[3]);
	var inclination = Number(parameters[4]);
	
    var cartesianCoordinates = new Direction(declination, inclination, intensity * 1E6).toCartesian();
	
	ceniehSpecimens[sampleName].steps.push(new Measurement(step, cartesianCoordinates, null));
	
  });

  // Add all specimens in the hashmap to the application
  ceniehSpecimens.forEach(function(specimen) {
    specimens.push(specimen);
  });

}

function importMunich(file) {

  /*
   * Function importMunich
   * Imports file to the Munich format
   */

  var lines = file.data.split(/\r?\n/).filter(Boolean);
  var parsedData = new Array();

  for(var i = 0; i < lines.length; i++) {
			
    // Reduce empty lines
    var parameters = lines[i].split(/[,\s\t]+/);
    parameters = parameters.filter(function(x) {
      return x !== "";
    });
			
    // Get the header
    if(i === 0) {
		
      var sampleName = parameters[0];
				
      // Different convention for core orientation than Utrecht
      // Munich measures the hade angle
      var coreAzimuth = Number(parameters[1]);
      var coreDip = 90 - Number(parameters[2]);
				
      // Bedding strike needs to be decreased by 90 for input convention
      var beddingStrike = (Number(parameters[3]) + 270) % 360;

      var beddingDip = Number(parameters[4]);
      var info = parameters[5];

    } else {

      // Get Cartesian coordinates for specimen coordinates (intensities in mA -> bring to μA)
      var dec = Number(parameters[3]);
      var inc = Number(parameters[4]);
      var intensity = Number(parameters[1]) * 1E3;
      
      var coordinates = new Direction(dec, inc, intensity).toCartesian();

      parsedData.push(new Measurement(parameters[0], coordinates, Number(parameters[2])));

    }
  }
	
  specimens.push({
    "demagnetizationType": null,
    "coordinates": "specimen",
    "format": "MUNICH",
    "version": __VERSION__,
    "created": new Date().toISOString(),
    "steps": parsedData,
    "name": sampleName,
    "volume": null,
    "level": 0,
    "location": null,
    "age": null,
    "lithology": null,
    "beddingStrike": Number(beddingStrike),
    "beddingDip": Number(beddingDip),
    "coreAzimuth": Number(coreAzimuth),
    "coreDip": Number(coreDip),
    "interpretations": new Array()
  });

}

function importBCN2G(file) {

  /*
   * Function importBCN2G
   * Imports binary BCN2G format (Barcelona & PGL Beijing)
   */

  // Split by start/end characters
  var lines = file.data.split(/[\u0002\u0003]/).slice(1);

  // Read at byte positions
  var sampleName = lines[2].slice(5, 12).replace(/\0/g, "");
  var sampleVolume = Number(lines[2].slice(14, 16));

  // Core and bedding parameters
  var coreAzimuth = Number(lines[2].slice(101, 104).replace(/\0/g, ""));
  var coreDip = Number(lines[2].slice(106,108).replace(/\0/g, ""));
  var beddingStrike = (Number(lines[2].slice(110, 113).replace(/\0/g, "")) + 270) % 360;
  var beddingDip = Number(lines[2].slice(115, 117).replace(/\0/g, ""));

  // This value indicates the declination correction that needs to be applied
  var declinationCorrection = Number(lines[2].slice(132, 136).replace(/\0/, ""))

  // TODO confirm with Elizabeth
  if(declinationCorrection) {
    coreAzimuth += declinationCorrection;
  }

  // Overturned bit flag is set: subtract 180 from the dip
  if(lines[2].charCodeAt(119) === 1) {
    beddingDip = beddingDip - 180;
  }

  // For each demagnetization step
  var steps = lines.slice(3).map(function(line) {

    // Each parameter is delimited by at least one NULL byte
    var parameters = line.split(/\u0000+/);

    // Intensity is in emu/cm^3 (0.001 A/m)
    var step = parameters[3];
    var dec = Number(parameters[4]);
    var inc = Number(parameters[5]);
    var intensity = 1E9 * Number(parameters[11]);

    var coordinates = new Direction(dec, inc, intensity).toCartesian();

    return new Measurement(step, coordinates, null);

  });

  specimens.push({
    "demagnetizationType": null,
    "coordinates": "specimen",
    "format": "BCN2G",
    "version": __VERSION__,
    "created": new Date().toISOString(),
    "steps": steps,
    "level": 0,
    "location": null,
    "lithology": null,
    "name": sampleName,
    "volume": Number(sampleVolume),
    "beddingStrike": Number(beddingStrike),
    "beddingDip": Number(beddingDip),
    "coreAzimuth": Number(coreAzimuth),
    "coreDip": Number(coreDip),
    "interpretations": new Array()
  });

}

function importCaltech(file) {

  /*
   * Function importCaltech
   * Parses for Caltech Institute of Technology format
   */

  var lines = file.data.split(/\r?\n/).filter(Boolean);

  // Sample name is specified at the top
  var sampleName = lines[0].trim();

  // First line has the core & bedding parameters
  var coreParameters = lines[1].split(/\s+/).filter(Boolean);

  // Correct core strike to azimuth and hade to plunge
  var coreAzimuth = (Number(coreParameters[0].trim()) + 270) % 360;
  var coreDip = 90 - Number(coreParameters[1].trim());
  var beddingStrike = Number(coreParameters[2].trim());
  var beddingDip = Number(coreParameters[3].trim());
  var sampleVolume = Number(coreParameters[4].trim());
 
  var line;
  var steps = new Array();

  for(var i = 2; i < lines.length; i++) {

    line = lines[i];

    var stepType = line.slice(0, 2);
    var step = line.slice(2, 6).trim() || "0";
    var dec = Number(line.slice(46, 51));
    var inc = Number(line.slice(52, 57));

    // Intensity in emu/cm3 -> convert to micro A/m (1E9)
    var intensity = 1E9 * Number(line.slice(31, 39));
    var a95 = Number(line.slice(40, 45));
    var info = line.slice(85, 113).trim();

    var coordinates = new Direction(dec, inc, intensity).toCartesian();

    steps.push(new Measurement(step, coordinates, a95));

  }

  specimens.push({
    "demagnetizationType": null,
    "coordinates": "specimen",
    "format": "CALTECH",
    "version": __VERSION__,
    "created": new Date().toISOString(),
    "steps": steps,
    "level": 0,
    "location": null,
    "age": null,
    "lithology": null,
    "name": sampleName,
    "volume": Number(sampleVolume),
    "beddingStrike": Number(beddingStrike),
    "beddingDip": Number(beddingDip),
    "coreAzimuth": Number(coreAzimuth),
    "coreDip": Number(coreDip),
    "interpretations": new Array()
  });


}

function importApplicationSaveOld(file) {

  /*
   * Function importApplicationSaveOld
   * Best effort backwards compatibility with old.paleomagnetism.org
   * Some information may be lost in the translation and files imported need to be reviewed
   */

  var json = JSON.parse(file.data);

  // Go over each sample
  json.forEach(function(specimen) {

    // Block this: it means the data is incompatible and needs to be patched
    if(specimen.patch !== 1.1) {
      throw(new Exception("This file contains incompatible specimens. Run this file through old.paleomagnetism.org."));
    }

    // Get the steps from the specimen 
    var steps = specimen.data.map(function(step) {
      return new Measurement(step.step, new Coordinates(step.x, step.y, step.z), Number(step.a95));
    });

    // Create the sample object
    var sample = {
      "demagnetizationType": null,
      "coordinates": "specimen",
      "format": "PMAGORG",
      "version": __VERSION__,
      "created": specimen.exported,
      "steps": steps,
      "level": 0,
      "location": null,
      "age": null,
      "lithology": null,
      "name": specimen.name,
      "volume": null,
      "beddingStrike": Number(specimen.bedStrike),
      "beddingDip": Number(specimen.bedDip),
      "coreAzimuth": Number(specimen.coreAzi),
      "coreDip": Number(specimen.coreDip),
      "interpretations": new Array()
    }

    // Try re-doing all the interpretations
    specimen.GEO.forEach(function(interpretation) {

      // Very old versions have no steps
      if(!Array.isArray(sample.steps)) {
        return;
      }

      // The interpretation includes a list of used steps
      sample.steps.forEach(function(step) {

        // Was included: set to true for the coming PCA
        if(interpretation.steps.includes(step.step)) {
          step.selected = true;
        } else {
          step.selected = false;
        }

      });

      // Map the interpretation type (dir === TAU1, gc === TAU3)
      var type;
      if(interpretation.type === "dir") {
        type = "TAU1";
      } else if(interpretation.type === "gc") {
        type = "TAU3";
      } else {
        throw(new Exception("Could not determine the type of the PCA."));
      }

      // Re-do the interpretation
      makeInterpretation(sample, {"type": type, "anchored": interpretation.forced, "refresh": false});

    });

    specimens.push(sample);

  });

}

function importApplicationSave(file) {

  /*
   * Function importApplicationSave
   * Imports a save from the application itself
   */

  const CONFIRM_INTEGRITY = true;

  var json = JSON.parse(file.data);

  // Confirm the file was not tampered with 
  if(CONFIRM_INTEGRITY && json.pid !== forge_sha256(JSON.stringify(json.specimens))) {
    throw(new Exception("Could not verify the integrity of this specimen file."));
  }

  json.specimens.forEach(function(specimen) {
    specimens.push(specimen);
  });

}

function importUtrecht(file) {

  /*
   * Function importUtrecht
   * Treats buffer as being Utrecht Format
   */

  // Split by 9999 (Utecht specimen delimiter)
  var blocks = file.data.split(/9999\r?\n/);

  if(blocks.length === 1 || blocks[blocks.length - 1] !== "END") {
    throw(new Exception("Invalid Utrecht format."));
  }

  // We can skip the latest block
  blocks.slice(0, -1).forEach(function(specimen, i) {

    // Slice the file header information
    if(i === 0) { 
      var blockLines = specimen.split(/\r?\n/).slice(1);
    } else {
      var blockLines = specimen.split(/\r?\n/).slice(0);
    }

    var header = blockLines.shift();

    // Extract the header parameters
    var [sampleName, _, coreAzimuth, coreDip, sampleVolume, beddingStrike, beddingDip] = header.split(/,[\s]*/);

    var steps = new Array();

    // Get the actual demagnetization data
    blockLines.slice(0, -1).forEach(function(measurement) {

      var [step, a, b, c, error, _, _] = measurement.split(/,[\s]*/);

      var coordinates = new Coordinates(-b, c, -a);

      steps.push(new Measurement(step, coordinates, error));

    });

    specimens.push({
      "demagnetizationType": null,
      "coordinates": "specimen",
      "format": "UTRECHT",
      "version": __VERSION__,
      "created": new Date().toISOString(),
      "steps": steps,
      "level": 0,
      "location": null,
      "age": null,
      "lithology": null,
      "name": sampleName,
      "volume": Number(sampleVolume),
      "beddingStrike": Number(beddingStrike),
      "beddingDip": Number(beddingDip),
      "coreAzimuth": Number(coreAzimuth),
      "coreDip": Number(coreDip),
      "interpretations": new Array()
    });

  });


}

function importHelsinki(file) {

  /*
   * Function importHelsinki
   * Imports demagnetization data in the Helsinki format (plain-text csv)
   */

  var lines = file.data.split(/\r?\n/).filter(Boolean);

  // Get some header metadata
  var sampleName = lines[5].split(";")[1]
  var coreAzimuth = Number(lines[5].split(";")[7])
  var coreDip = Number(lines[6].split(";")[7])
  var sampleVolume = Number(lines[7].split(";")[2]);
  var demagnetizationType = lines[7].split(";")[7];

  // Bedding is not included: always set to 0, 0
  var beddingStrike = 0;
  var beddingDip = 0;

  var steps = new Array();

  // Skip the header (12 lines)
  lines.slice(12).forEach(function(line) {

    var parameters = line.split(";");
    var step = parameters[1];

    // Take mA/m and set to microamps (multiply by 1E3)
    var x = Number(parameters[13]) * 1E3;
    var y = Number(parameters[14]) * 1E3;
    var z = Number(parameters[15]) * 1E3;

    var coordinates = new Coordinates(x, y, z);
    steps.push(new Measurement(step, coordinates, 0));

  });

  specimens.push({
    "demagnetizationType": demagnetizationType,
    "coordinates": "specimen",
    "format": "HELSINKI",
    "version": __VERSION__,
    "created": new Date().toISOString(),
    "steps": steps,
    "level": 0,
    "location": null,
    "age": null,
    "lithology": null,
    "name": sampleName,
    "volume": Number(sampleVolume),
    "beddingStrike": Number(beddingStrike),
    "beddingDip": Number(beddingDip),
    "coreAzimuth": Number(coreAzimuth),
    "coreDip": Number(coreDip),
    "interpretations": new Array()
  });

}
