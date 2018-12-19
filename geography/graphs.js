const PLOTBAND_COLOR_BLUE = "rgba(119, 152, 191, 0.25)";
const PLOTBAND_COLOR_RED = "rgba(191, 119, 152, 0.25)";

function getSelectedCollections() {

  /*
   * Function getSelectedCollections
   * Returns a reference to the sites that were selected
   */

  function isSelected(option) {
    return option.selected; 
  }

  function mapIndexToSite(index) {
    return collections[index];
  }

  function getIndex(option) {
    return Number(option.value);
  }

  return Array.from(document.getElementById("specimen-select").options).filter(isSelected).map(getIndex).map(mapIndexToSite);

}

function showExtremes(geographic, tectonic) {

  /*
   * Function showExtremes
   * Shows the extreme (geoographic & tectonic) coordinates for the Foltest module
   */

  const CHART_CONTAINER = "foldtest-geographic-container";
  const CHART_CONTAINER2 = "foldtest-tectonic-container";

  var dataSeriesGeographic = new Array();
  var dataSeriesTectonic = new Array();

  geographic.forEach(function(collection) {

    collection.components.forEach(function(component) {

      if(component.rejected) {
        return;
      }

      // Go over each step
      var direction = literalToCoordinates(component.coordinates).toVector(Direction);

      dataSeriesGeographic.push({
        "name": component.name,
        "x": direction.dec,
        "y": projectInclination(direction.inc),
        "inc": direction.inc,
      });

    });

  });

  tectonic.forEach(function(collection) {

    collection.components.forEach(function(component) {

      if(component.rejected) {
        return;
      }

      // Go over each step
      var direction = literalToCoordinates(component.coordinates).toVector(Direction);

      dataSeriesTectonic.push({
        "name": component.name,
        "x": direction.dec,
        "y": projectInclination(direction.inc),
        "inc": direction.inc,
      });

    });

  });

  var dataSeries = [{
    "name": "Geomagnetic Directions",
    "type": "scatter",
    "data": dataSeriesGeographic
  }];

  var dataSeries2 = [{
    "name": "Geomagnetic Directions",
    "type": "scatter",
    "data": dataSeriesTectonic
  }];

  eqAreaChart(CHART_CONTAINER, dataSeries);
  eqAreaChart(CHART_CONTAINER2, dataSeries2);

}

function bootstrapFoldtest() {

  /*
   * Function bootstrapFoldtest
   * Completes the classical foldtest but does a bootstrap on N randomly sampled data sets
   */

  const NUMBER_OF_BOOTSTRAPS = 1000;
  const progressBarElement = $("#foldtest-progress");

  // Get a list of the selected sites
  var collections = getSelectedCollections();

  if(collections.length === 0) {
    return notify("danger", "Select at least one collection.");
  }

  if(foldtestRunning) {
    return notify("warning", "The foldtest module is already running.");
  }

  foldtestRunning = true;

  // We are required to apply the cutoff for each collection seperately
  var cutoffCollectionsG = collections.map(function(collection) {
    return {"components": collection.components.map(x => x.inReferenceCoordinates("geographic"))}
  });

 // The same for tectonic coordinates
  var cutoffCollectionsT = collections.map(function(collection) {
    return {"components": collection.components.map(x => x.inReferenceCoordinates("tectonic"))}
  });

  var vectors = new Array().concat(...cutoffCollectionsG.map(x => x.components)).filter(x => x !== x.rejected);

  // Fake data for testing
  var AHHH = FAKE.data[1].data.map(function(x) {
    return {
      "coordinates": new Direction(x[0], x[1]).toCartesian(),
      "beddingStrike": x[2],
      "beddingDip": x[3]
    }
  });

  // Show the extremes
  showExtremes(cutoffCollectionsG,  cutoffCollectionsT); 

  var untilts = new Array();
  var savedBootstraps = new Array();

  // Save the unfolding of actual data
  savedBootstraps.push(unfold(AHHH, 0).taus);

  var result, next;
  var iteration = 0;

  if(!document.getElementById("foldtest-bootstrap-checkbox").checked) {
    return plotFoldtestCDF(new Array() , savedBootstraps);
  }

  // Asynchronous bootstrapping
  (next = function() {

    // Number of bootstraps were completed
    if(++iteration > NUMBER_OF_BOOTSTRAPS) {
      progressBarElement.css("width", "0%");
      return plotFoldtestCDF(untilts, savedBootstraps);     
    }

    result = unfold(drawBootstrap(AHHH), iteration);

    // Save the index of maximum untilting
    untilts.push(result.index);

    // Save the first 24 bootstraps
    if(iteration < 24) {
      savedBootstraps.push(result.taus);
    }

    progressBarElement.css("width", 100 * (iteration / NUMBER_OF_BOOTSTRAPS) + "%");

    // Queue for next bootstrap
    setTimeout(next, 0);

  })();

}

var shallowingRunning = false;
var foldtestRunning = false;

function bootstrapShallowing() {

    /*
     * Function bootstrapShallowing
     * Bootstraps the inclination shallowing module
     */

  function formatHSArray(x) {

    /*
     * Function formatHSArray
     * Formats the derived elongation, flattening as a highcharts point object
     */

    return {
      "x": x.inclination,
      "y": x.elongation,
      "f": x.flattening
    }

  }

  const NUMBER_OF_BOOTSTRAPS = 2500;
  const NUMBER_OF_BOOTSTRAPS_SAVED = 25;

  const progressBarElement = $("#shallowing-progress");

  // Get the single selected site
  var collections = getSelectedCollections();
 
  if(collections.length === 0) {
    return notify("danger", "No collections are selected.");
  }
  if(collections.length > 1) {
    return notify("danger", "Only one collection may be selected.");
  }

  if(shallowingRunning) {
    return notify("warning", "The inclination shallowing module is already running.");
  }

  shallowingRunning = true;

  // Get the vector in the reference coordinates
  var dirs = doCutoff(collections[0].components.map(x => x.inReferenceCoordinates())).components;

  var nIntersections = 0;
  var bootstrapIteration = 0;

  var inclinations = new Array();

  // Some fake data (compare to pmag live)
  var dirs = FAKE.data[0].data.filter(x => x[4] !== "EI_Example.16").map(function(x) {
    return new Direction(x[0], x[1])
  });

  if(dirs.length < 80) {
    return notify("danger", "A minimum of 80 components is recommended.");
  }

  var originalInclination = meanDirection(dirs).inc;
  var originalUnflatted = unflattenDirections(dirs);

  var savedBootstraps = new Array();

  // Original data does not have an intersection with TK03.GAD
  if(originalUnflatted !== null) {
    savedBootstraps.push(originalUnflatted.map(formatHSArray));
    unflattenedInclination = originalUnflatted[originalUnflatted.length - 1].inclination;
  } else {
    savedBootstraps.push({"x": null, "y": null});
    unflattenedInclination = null;
  }

  // No bootstrap requested
  if(!document.getElementById("shallowing-bootstrap-checkbox").checked) {
    return EICompletionCallback(new Array(), originalInclination, unflattenedInclination, savedBootstraps);
  }

  var next;
  var iteration = 0;

  // Asynchronous bootstrapping
  (next = function() {

    // Bootstrapp completed: finish
    if(++iteration > NUMBER_OF_BOOTSTRAPS) {
      return EICompletionCallback(inclinations, originalInclination, unflattenedInclination, savedBootstraps);
    }

    var result = unflattenDirections(drawBootstrap(dirs));

    // No intersection with TK03.GAD: next bootstrap
    if(result === null) {
      return setTimeout(next, 0);
    }

    // Save the first 24 bootstraps
    if(iteration < NUMBER_OF_BOOTSTRAPS_SAVED) {
      savedBootstraps.push(result.map(formatHSArray));
    }

    // Save the inclination of intersection
    inclinations.push(result.pop().inclination);

    progressBarElement.css("width", 100 * (iteration / NUMBER_OF_BOOTSTRAPS) + "%");

    // Queue for next bootstrap
    setTimeout(next, 0);

  })();

}

function EICompletionCallback(inclinations, originalInclination, unflattenedInclination, bootstraps) {

  /*
   * Function EICompletionCallback
   * Callback fired when the EI module has completed
   */

  // Unlock
  shallowingRunning = false;
  $("#shallowing-progress").css("width", "0%");

  // Initialize the charts
  plotEIBootstraps(bootstraps, inclinations.length);
  plotEICDF(inclinations, originalInclination, unflattenedInclination);

}

function EIBootstrapTooltipFormatter() {

  /*
   * Function EIBootstrapTooltipFormatter
   * Formatter for the EI bootstrap chart
   */

  if(this.series.name == "Bootstraps") {
    return  [
      "<b>Unflattened Collection</b>",
      "<b>Inclination: </b> " + this.x.toFixed(3),
      "<b>Elongation: </b>" + this.y.toFixed(3),
      "<b>Flattening factor </b> at " + this.point.f
    ].join("<br>");
  } else {
    return [
      "<b>TK03.GAD Expected Elongation</b>",
      "<b>Inclination: </b>" + this.x,
      "<br><b>Elongation </b>" + this.y.toFixed(3)
    ].join("<br>");
  }

}

function getPolynomialSeries(min, max) {

  /*
   * Function getPolynomialSeries
   * Gets the TK03.GAD Polynomial as a Highcharts data array from min to max
   */

  var TK03Poly = new Array();

  for(var i = min; i <= max; i++) {
    TK03Poly.push({
      "x": i,
      "y": TK03Polynomial(i)
    });
  }

  return TK03Poly;

}

function plotEIBootstraps(bootstraps, totalBootstraps) {
  
  /*
   * Function plotEIBootstraps
   * Plotting function for the EI bootstraps
   */

  const CHART_CONTAINER = "ei-bootstrap-container";

  // Define the initial series (TK03.GAD Polynomial) and the unflattening of the actual non-bootstrapped data (kept in data[0])
  var mySeries = [{
    "name": "TK03.GAD Polynomial", 
    "data": getPolynomialSeries(-90, 90),
    "dashStyle": "ShortDash",
    "lineWidth": 3,
    "zIndex": 100,
    "type": "spline",
    "marker": {
      "enabled": false
    }
  }, {
    "name": "Bootstraps",
    "color": HIGHCHARTS_PINK,
    "id": "bootstrap",
    "type": 'spline',
    "data": bootstraps.shift(),
    "zIndex": 100,
    "lineWidth": 3,
    "marker": {
      "enabled": false,
      "symbol": "circle",
    }  
  }]

  // Add the other bootstraps
  bootstraps.forEach(function(bootstrap) {
    mySeries.push({
      "data": bootstrap,
      "type": "spline",
      "color": PLOTBAND_COLOR_BLUE, 
      "linkedTo": "bootstrap",
      "enableMouseTracking": false, 
      "marker": {
        "enabled": false
      }
    })
  });

  new Highcharts.chart(CHART_CONTAINER, {
    "chart": {
      "id": "EI-bootstraps"
    },
    "title": {
      "text": "Bootstrapped E-I Pairs",
    },
    "subtitle": {
      "text": "Found " + totalBootstraps + " bootstrapped intersections with the TK03.GAD Field Model (" + COORDINATES + " coordinates)"
    },
    "exporting": {
      "filename": "TK03-EI",
      "sourceWidth": 1200,
      "sourceHeight": 600,
      "buttons": {
        "contextButton": {
          "symbolStroke": "#7798BF",
          "align": "right"
        }
      }
    },
    "xAxis": {
      "min": -90,
      "max": 90,
      "title": {
        "text": "Inclination (°)"
      }
    },
    "yAxis": {
      "floor": 1,
      "ceiling": 3,
      "title": {
        "text": "Elongation (τ2/τ3)"
      },
    },
    "credits": {
      "enabled": ENABLE_CREDITS,
      "text": "Paleomagnetism.org [EI Module] - <i>after Tauxe et al., 2008 </i>",
      "href": ""
    },
    "plotOptions": {
      "series": {
        "turboThreshold": 0,
      }
    },
    "tooltip": {
      "formatter": EIBootstrapTooltipFormatter
    },
    "series": mySeries
  });

}

function getAverageInclination(cdf) {

  /*
   * Function getAverageInclination
   * Returns the average from the cumulative distribution
   */

  var sum = 0;

  cdf.forEach(function(x) {
    sum = sum + x.x;
  });

  return sum / cdf.length;

}

function getConfidence(cdf) {

  /*
   * Function getConfidence
   * Returns the upper
   */

  var array = cdf.map(x => x.x);

  var lower = array[parseInt(0.025 * array.length, 10)] || 0;
  var upper = array[parseInt(0.975 * array.length, 10)] || 0;

  return { lower, upper }

}

function plotEICDF(inclinations, originalInclination, unflattenedInclination) {

  /*
   * Function plotEICDF
   * Creates the CDF chart for the EI module
   */

  function tooltip() {
  
    /*
     * Function plotEICDF::tooltip
     * Handles tooltip for the EI CDF Chart
     */

    return [
      "<b>Cumulative Distribution </b>",
      "<b>Latitude: </b>" + this.x.toFixed(2),
      "<b>CDF: </b>" + this.point.y.toFixed(3)
    ].join("<br>");
  
  }

  function getVerticalLine(x) {

    /*
     * Function plotEICDF::getVerticalLine
     * Return a vertical line in a CDF chart from 0 -> 1 at position x 
     */

    return new Array([x, 0], [x, 1]);

  }

  const CHART_CONTAINER = "ei-cdf-container";

  // Calculate the cumulative distribution
  var cdf = getCDF(inclinations);

  // Get the lower and upper 2.5%
  var confidence = getConfidence(cdf);

  // Add the confidence plot band
  var plotBands = [{
    "color": PLOTBAND_COLOR_BLUE,
    "from": confidence.lower,
    "to": confidence.upper
  }];

  // Calculate the average inclination of all bootstraps
  var averageInclination = getAverageInclination(cdf);
      
  //Define the cumulative distribution function
  var mySeries = [{
    "name": "Cumulative Distribution", 
    "data": cdf, 
    "marker": {
      "enabled": false
    }
  }, {
    'name': "Average Bootstrapped Inclination",
    'type': "line",
    'data': getVerticalLine(averageInclination),
    'color': HIGHCHARTS_ORANGE,
    'enableMouseTracking': false,
    'marker': {
      'enabled': false
    },
  }, {
    "name": 'Original Inclination',
    "type": 'line',
    "data": getVerticalLine(originalInclination),
    "color": HIGHCHARTS_PINK,
    "enableMouseTracking": false,
    "marker": {
      "enabled": false
    }
  }];

  // If the original data intersected with TK03.GAD
  if(unflattenedInclination !== null) {
    mySeries.push({
      "name": "Unflattened Inclination",
      "type": "line",
      "color": HIGHCHARTS_GREEN,
      "data": getVerticalLine(unflattenedInclination),
      "enableMouseTracking": false,
      "marker": {
        "enabled": false
      }
    });
  }

  new Highcharts.chart(CHART_CONTAINER, {
    "title": {
      "text": "Cumulative Distribution of bootstrapped TK03.GAD intersections",
    },
    "exporting": {
      "filename": "TK03_CDF",
      "sourceWidth": 1200,
      "sourceHeight": 600,
      "buttons": {
        "contextButton": {
          "symbolStroke": "#7798BF",
          "align": "right"
        }
      }
    },
    "subtitle": {
      "text": "EI"
    },
    "xAxis": {
      "min": -90,
      "max": 90,
      "plotBands": plotBands,
      "title": {
        "text": "Inclination (°)"
      }
    },
    "plotOptions": {
      "series": {
        "turboThreshold": 0
      }
    },
    "credits": {
      "enabled": ENABLE_CREDITS,
      "text": "Paleomagnetism.org [EI Module] - <i>after Tauxe et al., 2008 </i>",
      "href": ""
    },
    "tooltip": {
      "formatter": tooltip
    },
    "yAxis": {
      "min": 0,
      "max": 1,
      "title": {
        "text": "Cumulative Distribution"
      }
    },
    "series": mySeries
  });

}

function lastIndex(array) {

  return array[array.length - 1];

}

function unflattenDirections(data) {

  // Get the tan of the observed inclinations (equivalent of tan(Io))
  var tanInclinations = data.map(x => Math.tan(x.inc * RADIANS));

  var results = new Array();

  // Decrement over the flattening values f from 100 to 20
  // We will find f with a resolution of 1%
  for(var i = 100; i >= 20; i--) {
  
    // Flattening factor (from 1 to 0.2)
    var f = i / 100; 
    
    // Unflattening function after King, 1955
    // (tanIo = f tanIf) where tanIo is observed and tanIf is recorded.
    // Create unflattenedData containing (dec, inc) pair for a particular f
    var unflattenedData = tanInclinations.map(function(x, i) {
      return new Direction(data[i].dec, Math.atan(x / f) / RADIANS);
    });

    // Calculate mean inclination for unflattenedData and get eigenvalues
    var meanInc = meanDirection(unflattenedData).inc;
    var eigenvalues = getEigenvalues(TMatrix(unflattenedData.map(x => x.toCartesian().toArray())));
    var elongation = eigenvalues.t2 / eigenvalues.t3;
    
    results.push({
      "flattening": f,
      "elongation": elongation,
      "inclination": meanInc
    });
    
    // In case we initially start above the TK03.GAD Polynomial
    // For each point check if we are above the polynomial; if so pop the parameters and do not save them
    // This simple algorithm finds the line below the TK03.GAD polynomial
    // Compare expected elongation with elongation from data from TK03.GAD
    // Only do this is Epoly < Edata
    // If there is more than 1 consecutive flattening factor in the array
    // This means we have a line under the TK03.GAD Polynomial
    // So we can return our parameters
    if(TK03Polynomial(meanInc) <= elongation) {

      if(results.length === 1) {
        results.pop();
        continue;
      }

      return results;

    }

  }
  
  // No intersection with TK03.GAD polynomial return zeros
  // this is filtered in the main routine and recorded as no-intersect
  return null;
  
}

function TK03Polynomial(inc) {

  /*
   * Function polynomial
   * Plots the foldtest data
   */

  const COEFFICIENTS = new Array(
    3.15976125e-06,
    -3.52459817e-04,
    -1.46641090e-02,
    2.89538539e+00
  );

  var inc = Math.abs(inc);
  
  // Polynomial coefficients
  return COEFFICIENTS[0] * Math.pow(inc, 3) + COEFFICIENTS[1] * Math.pow(inc, 2) + COEFFICIENTS[2] * inc + COEFFICIENTS[3];
  
}

function plotFoldtestCDF(untilt, savedBootstraps) {

  /*
   * Function plotFoldtestCDF
   * Plots the foldtest data
   */

  foldtestRunning = false;

  const CHART_CONTAINER = "foldtest-full-container";
  const NUMBER_OF_BOOTSTRAPS = 1000;
  const UNFOLDING_MIN = -50;
  const UNFOLDING_MAX = 150;

  var cdf = getCDF(untilt);
  var lower = untilt[parseInt(0.025 * NUMBER_OF_BOOTSTRAPS, 10)] || UNFOLDING_MIN;
  var upper = untilt[parseInt(0.975 * NUMBER_OF_BOOTSTRAPS, 10)] || UNFOLDING_MAX;

  // Create plotband for 95% bootstrapped confidence interval
  var plotBands =  [{
    "color": PLOTBAND_COLOR_BLUE,
    "from": lower,
    "to": upper
  }];

  var mySeries = [{
    'name': 'CDF', 
    'data': cdf, 
    'marker': {
      'enabled': false
    }
  }, {
    "name": "Bootstraps",
    "type": "spline",
    "id": "bootstraps",
    "color": "red",
    "data": savedBootstraps.shift(),
    "zIndex": 10
  }]

  mySeries.push({
    "name": "Geographic Coordinates",
    "type": "line",
    "color": HIGHCHARTS_GREEN,
    "data": [[0, 0], [0, 1]],
    "enableMouseTracking": false,
    "marker": {
      "enabled": false
    }
  }, {
    "name": "Tectonic Coordinates",
    "type": "line",
    "data": [[100, 0], [100, 1]],
    "color": HIGHCHARTS_ORANGE,
    "enableMouseTracking": false,
    "marker": {
      "enabled": false
    }
  });

  savedBootstraps.forEach(function(bootstrap) {
    mySeries.push({
      "color": PLOTBAND_COLOR_BLUE,
      "data": bootstrap,
      "type": "spline",
      "linkedTo": "bootstraps",
      "enableMouseTracking": false,
    });
  });

  new Highcharts.chart(CHART_CONTAINER, {
    "chart": {
      "id": "foldtest",
      "renderTo": "container5",
    },
    "title": {
      "text": "Bootstrapped foldtest",
    },
    "subtitle": {
      "text": "highest τ1 between [" + lower + ", " + upper + "] % unfolding (" + cdf.length + " bootstraps)",
    },
    "exporting": {
      "filename": "Foldtest",
      "sourceWidth": 1200,
      "sourceHeight": 600,
      "buttons": {
        "contextButton": {
          "symbolStroke": "#7798BF",
          "align": "right"
        }
      }
    },
    "xAxis": {
      "min": UNFOLDING_MIN,
      "max": UNFOLDING_MAX,
      "tickInterval": 10,
      "pointInterval": 10,
      "title": {
        "text": "Percentage Unfolding"
      },
      "plotBands": plotBands
    },
    "yAxis": {
     "floor": 0,
     "ceiling": 1,
     "title": {
       "text": "τ1 (maximum eigenvalue)"
     }
    },
    "credits": {
      "enabled": ENABLE_CREDITS,
      "text": "Paleomagnetism.org [Foldtest Module] - <i>after Tauxe et al., 2010 </i>",
      "href": ""
    },
    "tooltip": {
      "enabled": true,
    },
    "plotOptions": {
      "spline": {
        "marker": {
          "enabled": false
        }
      }
    },
    "series": mySeries
  });

}

function unfold(vectors, iteration) {

  /*
   * Function unfold
   * Unfolds a bunch of vectors following their bedding
   */

  function eigenvaluesOfUnfoldedDirections(vectors, unfoldingPercentage) {

    /*
     * Function eigenvaluesOfUnfoldedDirections
     * Returns the three eigenvalues of a cloud of vectors at a percentage of unfolding
     */

    // Do the tilt correction on all points in pseudoDirections
    var tilts = vectors.map(function(vector) {
      return literalToCoordinates(vector.coordinates).correctBedding(vector.beddingStrike, 1E-2 * unfoldingPercentage * vector.beddingDip);
    });

    // Return the eigen values of a real, symmetrical matrix
    return getEigenvalues(TMatrix(tilts.map(x => x.toArray())));

  }

  const UNFOLDING_MIN = -50;
  const UNFOLDING_MAX = 150;
  const NUMBER_OF_BOOTSTRAPS_SAVED = 24;

  // Variable max to keep track of the maximum eigenvalue and its unfolding % index
  var max = 0;
  var index = 0;
  
  // Array to capture all maximum eigenvalues for one bootstrap over the unfolding range
  var taus = new Array();

  // For this particular random set of directions unfold from the specified min to max percentages
  // With increments of 10 degrees
  for(var i = UNFOLDING_MIN; i <= UNFOLDING_MAX; i += 10) {
  	
    // Calculate the eigenvalues
    var tau = eigenvaluesOfUnfoldedDirections(vectors, i);

    // Save the first 24 bootstraps
    if(iteration < NUMBER_OF_BOOTSTRAPS_SAVED) {
      taus.push({
        "x": i,
        "y": tau.t1
      });
    }

    if(tau.t1 > max) {
      max = tau.t1;
      index = i
    }

  }

  // Hone in with a granularity of a single degree
  for(var i = index - 9; i <= index + 9; i++) {
  
    // Only if within specified minimum and maximum bounds
    if(i < UNFOLDING_MIN || i > UNFOLDING_MAX) {
      continue;
  	}

    // Calculate the eigenvalues
    var tau = eigenvaluesOfUnfoldedDirections(vectors, i);

    // Save the maximum eigenvalue for this bootstrap and unfolding increment
    if(tau.t1 > max) {
      max = tau.t1;
      index = i;
    }

  }

  return {
    "index": index,
    "taus": taus
  }

}

var getEigenvalues = function(T) {

  /*
   * Function getEigenvalues
   * Algorithm to find eigenvalues of a symmetric, real matrix.
   * We need to compute the eigenvalues for many (> 100.000) real, symmetric matrices (Orientation Matrix T).
   * Calling available libraries (Numeric.js) is much slower so we implement this algorithm instead.
   * Publication: O.K. Smith, Eigenvalues of a symmetric 3 × 3 matrix - Communications of the ACM (1961)
   * See https://en.wikipedia.org/wiki/Eigenvalue_algorithm#3.C3.973_matrices
   */
	
  // Calculate the trace of the orientation matrix
  // 3m is equal to the trace
  var m = (T[0][0] + T[1][1] + T[2][2]) / 3;
	
  // Calculate the sum of squares
  var p1 = Math.pow(T[0][1], 2) + Math.pow(T[0][2], 2) + Math.pow(T[1][2], 2);	
  var p2 = Math.pow((T[0][0] - m), 2) + Math.pow((T[1][1] - m), 2) + Math.pow((T[2][2] - m), 2) + 2 * p1;
	
  // 6p is equal to the sum of squares of elements
  var p = Math.sqrt(p2 / 6);
	
  // Identity Matrix I and empty storage matrix B
  var B = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  var I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
	
  for (var i = 0; i < 3; i++ ) {
    for (var k = 0; k < 3; k++) {
      B[i][k] = (1 / p) * (T[i][k] - m * I[i][k]);
    }
  }

  // Half determinant of matrix B.
  var r = 0.5 * numeric.det(B);
	
  var phi;
  if(r <= -1) {
    phi = Math.PI / 3;
  } else if(r >= 1) {
    phi = 0;
  } else {
    phi = Math.acos(r) / 3;
  }
	
  // Calculate the three eigenvalues
  var eig1 = m + 2 * p * Math.cos(phi);
  var eig3 = m + 2 * p * Math.cos(phi + (2 * Math.PI / 3));

  // Last eigenvector can be derived
  var eig2 = 3 * m - eig1 - eig3;
	
  // Normalize eigenvalues
  var tr = eig1 + eig2 + eig3;

  return {
    "t1": eig1 / tr,
    "t2": eig2 / tr,
    "t3": eig3 / tr
  }
	
}

function getSelectedComponents() {

  /*
   * Function getSelectedComponents
   * Gets all the components from all collections as if it was a single collection
   */

  var components = new Array();

  // Get the requested polarity
  var polarity = document.getElementById("polarity-selection").value || null;

  getSelectedCollections().forEach(function(collection) {

    // Get the components in the correct coordinate system
    var comp = collection.components.map(x => x.inReferenceCoordinates());

    // Nothing to do
    if(polarity === null) {
      return components = components.concat(comp);
    }

    // Nothing to do
    var sign = Math.sign(getStatisticalParameters(comp).dir.mean.inc);
    if((sign === 1 && polarity === "NORMAL") || (sign === -1 && polarity === "REVERSED")) {
      return components = components.concat(comp);
    }

    // Reflect the coordinates
    comp.forEach(function(x) {
      components.push(new Component(x, x.coordinates.reflect()));
    });

  });

  return components;

}

function bootstrapCTMD() {

  /*
   * Function bootstrapCTMD
   * Does a bootstrap on the true data
   */

  const NUMBER_OF_BOOTSTRAPS = 1000;

  var collections = getSelectedCollections();

  if(collections.length !== 2) {
    return notify("danger", "Select two sites to compare.");
  }

  // Get the site components in reference coordinates
  cSites = collections.map(function(collection) {
    return doCutoff(collection.components.map(x => x.inReferenceCoordinates()));
  });

  // Buckets for the coordinates
  var xOne = new Array();
  var xTwo = new Array();
  var yOne = new Array();
  var yTwo = new Array();
  var zOne = new Array();
  var zTwo = new Array();

  // Complete N bootstraps
  for(var i = 0; i < NUMBER_OF_BOOTSTRAPS; i++) {

    // Draw a random selection from the site
    var sampledOne = drawBootstrap(cSites[0].components);
    var sampledTwo = drawBootstrap(cSites[1].components);

    // Calculate the mean value
    var statisticsOne = getStatisticalParameters(sampledOne);
    var statisticsTwo = getStatisticalParameters(sampledTwo);

    var coordinatesOne = statisticsOne.dir.mean.toCartesian();
    var coordinatesTwo = statisticsTwo.dir.mean.toCartesian();

    // Save the coordinates
    xOne.push(coordinatesOne.x);
    yOne.push(coordinatesOne.y);
    zOne.push(coordinatesOne.z);

    xTwo.push(coordinatesTwo.x);
    yTwo.push(coordinatesTwo.y);
    zTwo.push(coordinatesTwo.z);

  }

  var names = {
    "one": collections[0].name,
    "two": collections[1].name
  }

  // Call plotting routine for each component
  var xParams = plotCartesianBootstrap("ctmd-container-x", xOne, xTwo, names, NUMBER_OF_BOOTSTRAPS);
  var yParams = plotCartesianBootstrap("ctmd-container-y", yOne, yTwo, names, NUMBER_OF_BOOTSTRAPS);
  var zParams = plotCartesianBootstrap("ctmd-container-z", zOne, zTwo, names, NUMBER_OF_BOOTSTRAPS);

  // Update the table
  updateCTMDTable(names, xParams, yParams, zParams);

}

function updateCTMDTable(names, xParams, yParams, zParams) {

  /*
   * Function updateCTMDTable
   * Updates the CTMD table with the two collections and parameters
   */

  function doesMatch(xParams, yParams, zParams) {
 
    /*
     * Function doesMatch
     * Checks whether two bootstraps overlap
     */

    // Are the confidence regions overlapping?
    if(xParams.one.upper > xParams.two.lower && xParams.one.lower < xParams.two.upper) {
      if(yParams.one.upper > yParams.two.lower && yParams.one.lower < yParams.two.upper) {
        if(zParams.one.upper > zParams.two.lower && zParams.one.lower < zParams.two.upper) {
          return true;
        }
      }
    }
 
    return false;
 
  }

  function getMatchHTML(match) {

    /*
     * Function getMatchHTML
     * Returns HTML showing whether the test was a match or not
     */

    if(match) {
      return "<span class='text-success'><b><i class='fas fa-check'></i> Match!</b></span>";
    } else {
      return "<span class='text-danger'><b><i class='fas fa-times'></i> No Match!</b></span>";
    }

  }

  const PRECISION = 2;

  var match = doesMatch(xParams, yParams, zParams);

  document.getElementById("bootstrap-table").innerHTML = [
    "  <caption>1000 bootstrapped Cartesian coordinates for the collections at 95% confidence. " + getMatchHTML(match) + "</caption>",
    "  <thead>",
    "  <tr>",
    "    <td>Collection</td>",
    "    <td>xMinimum</td>",
    "    <td>xMaximum</td>",
    "    <td>yMinimum</td>",
    "    <td>yMaximum</td>",
    "    <td>zMinimum</td>",
    "    <td>zMaximum</td>",
    "  </tr>",
    "  </thead>",
    "  <tbody>",
    "  <tr>",
    "    <td>" + names.one + "</td>",
    "    <td>" + xParams.one.lower.toFixed(PRECISION) + "</td>",
    "    <td>" + xParams.one.upper.toFixed(PRECISION) + "</td>",
    "    <td>" + yParams.one.lower.toFixed(PRECISION) + "</td>",
    "    <td>" + yParams.one.upper.toFixed(PRECISION) + "</td>",
    "    <td>" + zParams.one.lower.toFixed(PRECISION) + "</td>",
    "    <td>" + zParams.one.upper.toFixed(PRECISION) + "</td>",
    "  </tr>",
    "  <tr>",
    "    <td>" + names.two + "</td>",
    "    <td>" + xParams.two.lower.toFixed(PRECISION) + "</td>",
    "    <td>" + xParams.two.upper.toFixed(PRECISION) + "</td>",
    "    <td>" + yParams.two.lower.toFixed(PRECISION) + "</td>",
    "    <td>" + yParams.two.upper.toFixed(PRECISION) + "</td>",
    "    <td>" + zParams.two.lower.toFixed(PRECISION) + "</td>",
    "    <td>" + zParams.two.upper.toFixed(PRECISION) + "</td>",
    "  </tr>",
    "  </tbody>"
  ].join("\n");

}

function getCDF(input) {

  /*
   * Functiom getCDF
   * Returns the cumulative distribution function of an array
   */

  // Calculate the cumulative distribution function of the sorted input
  return input.sort(numericSort).map(function(x, i) {
    return {
      "x": x,
      "y": i / (input.length - 1)
    }
  });

}

function plotCartesianBootstrap(container, one, two, names, nBootstraps) {

  /*
   * Function plotCartesianBootstrap
   * Plots a single cartesian bootstrap to a container
   */

  function CTMDTooltip() {
  
    /*
     * Function CTMDTooltip
     * Returns the formatted CTMD tooltip
     */
  
    return [
      "<b>Cumulative Distribution </b>",
      "<b>Collection: </b>" + this.series.name,
      "<b>Coordinate: </b>" + this.x.toFixed(2),
      "<b>CDF: </b>" + this.point.y.toFixed(3)
    ].join("<br>");
  
  }

  // Get the index of the upper and lower 5%
  var lower = parseInt(0.025 * nBootstraps, 10);
  var upper = parseInt(0.975 * nBootstraps, 10);

  var cdfOne = getCDF(one);
  var cdfTwo = getCDF(two);

  //Define plot bands to represent confidence envelopes
  var plotBands = [{
    "from": cdfOne[lower].x,
    "to": cdfOne[upper].x,
    "color": PLOTBAND_COLOR_BLUE
  }, {
    "from": cdfTwo[lower].x,
    "to": cdfTwo[upper].x,
    "color": PLOTBAND_COLOR_RED
  }];
      
  //Define the cumulative distribution function
  //Info array contains site names
  var coordinateSeries = [{
    "name": names.one, 
    "data": cdfOne,
    "color": HIGHCHARTS_BLUE,
    "marker": {
      "enabled": false
    }
  }, {
    "name": names.two,
    "color": HIGHCHARTS_RED,
    "data": cdfTwo, 
    "marker": {
      "enabled": false
    }
  }];
  
  new Highcharts.chart(container, {
    "title": {
      "text": container.slice(-1) + "-component",
    },
    "exporting": {
      "filename": "coordinate-bootstrap",
      "sourceWidth": 400,
      "sourceHeight": 400,
      "buttons": {
        "contextButton": {
          "symbolStroke": "#7798BF",
          "align": "right"
        },
      }
    },
    "subtitle": {
      "text": "(" + COORDINATES + " coordinates; N = " + nBootstraps + ")"
    },
    "plotOptions": {
      "series": {
        "turboThreshold": 0
      }
    },
    "xAxis": {
      "title": {
        "text": "Cartesian Coordinate on Unit Sphere"
      },
      "plotBands": plotBands,
    },
    "credits": {
      "enabled": ENABLE_CREDITS,
      "text": "Paleomagnetism.org [CTMD] - Coordinate Bootstrap (Tauxe et al., 2010)",
      "href": ""
    },
    "tooltip": {
      "formatter": CTMDTooltip
    },
    "yAxis": {
      "min": 0,
      "max": 1,
      "title": {
        "text": "Cumulative Distribution"
      }
    },
    "series": coordinateSeries
  });

  return {
    "one": {
      "lower": cdfOne[lower].x,
      "upper": cdfOne[upper].x
    },
    "two": {
      "lower": cdfTwo[lower].x,
      "upper": cdfTwo[upper].x
    }
  }
  
}

function drawBootstrap(data) {

  /*
   * Function drawBootstrap
   * Draws a random new distribution from a distribution of the same size
   */

  function randomSample() {

    /*
     * Function drawBootstrap::randomSample
     * Returns a random sample from an array
     */

    return data[Math.floor(Math.random() * data.length)];

  }

  // Do not include rejected components
  return data.map(randomSample);

}

function generateHemisphereTooltip() {

  /*
   * Function generateHemisphereTooltip
   * Generates the appropriate tooltip for each series
   */

  if(this.series.name === "ChRM Directions" || this.series.name === "Geomagnetic Directions") {
    return [
      "<b>Sample: </b>" + this.point.name,
      "<b>Declination: </b>" + this.x.toFixed(1),
      "<b>Inclination </b>" + this.point.inc.toFixed(1)
    ].join("<br>");
  } else if(this.series.name === "VGPs") {
    return [
      "<b>Sample: </b>" + this.point.name,
      "<b>Longitude: </b>" + this.x.toFixed(1),
      "<br><b>Latitude: </b>" + this.point.inc.toFixed(1)
    ].join("<br>");
  } else if(this.series.name.startsWith("Mean Direction")) {
    return [
      "<b>Mean Direction</b>",
      "<b>Declination: </b>" + this.x.toFixed(1),
      "<br><b>Inclination: </b>" + this.point.inc.toFixed(1)
    ].join("<br>");
  } else if(this.series.name === "Mean VGP") {
    return [
      "<b>Mean VGP</b>",
      "<b>Longitude: </b>" + this.x.toFixed(1),
      "<br><b>Latitude: </b>" + this.point.inc.toFixed(1)
    ].join("<br>");
  }

}

function eqAreaProjectionMean() {

  /*
   * Function eqAreaProjectionMean
   * Plotting routine for collection means
   */

  const CHART_CONTAINER = "mean-container";
  const A95_CONFIDENCE = true;
  const PRECISION = 2;

  var dataSeries = new Array();
  var statisticsRows = new Array();

  getSelectedCollections().forEach(function(site) {

    var cutofC = doCutoff(site.components.map(x => x.inReferenceCoordinates()));
    var statistics = getStatisticalParameters(cutofC.components);

    // Check if a polarity switch is requested
    if(statistics.dir.mean.inc < 0 && document.getElementById("polarity-selection").value === "NORMAL") {
      statistics.dir.mean.inc = -statistics.dir.mean.inc;
      statistics.dir.mean.dec = (statistics.dir.mean.dec + 180) % 360;
    }
    if(statistics.dir.mean.inc > 0 && document.getElementById("polarity-selection").value === "REVERSED") {
      statistics.dir.mean.inc = -statistics.dir.mean.inc;
      statistics.dir.mean.dec = (statistics.dir.mean.dec + 180) % 360;
    }

    var A95Ellipse = getConfidenceEllipse(statistics.pole.confidence);

    if(A95_CONFIDENCE) {
      var a95ellipse = transformEllipse(A95Ellipse, statistics.dir);
    } else {
      var a95ellipse = getPlaneData(statistics.dir.mean, statistics.dir.confidence);
    }

    dataSeries.push({
      "name": "Mean Direction " + site.name,
      "type": "scatter",
      "data": new Array(statistics.dir.mean).map(prepareDirectionData),
      "color": HIGHCHARTS_GREEN,
      "marker": {
        "symbol": "circle",
        "radius": 6,
        "lineColor": HIGHCHARTS_GREEN,
        "lineWidth": 1,
        "fillColor": (statistics.dir.mean.inc < 0 ? HIGHCHARTS_WHITE : HIGHCHARTS_GREEN)
      }
    }, {
      "name": "Confidence Ellipse",
      "linkedTo": ":previous",
      "type": "line",
      "color": HIGHCHARTS_RED,
      "data": a95ellipse,
      "enableMouseTracking": false,
      "marker": {
        "enabled": false
      }
    });

    statisticsRows.push([
      "<tr>",
      "  <td>" + site.name + "</td>",
      "  <td>" + cutofC.components.filter(x => !x.rejected).length + "</td>",
      "  <td>" + cutofC.components.length + "</td>",
      "  <td>" + cutofC.cutoff.toFixed(PRECISION) + "</td>",
      "  <td>" + cutofC.scatter.toFixed(PRECISION) + "</td>",
      "  <td>" + statistics.dir.mean.dec.toFixed(PRECISION) + "</td>",
      "  <td>" + statistics.dir.mean.inc.toFixed(PRECISION) + "</td>",
      "  <td>" + statistics.dir.R.toFixed(PRECISION) + "</td>",
      "  <td>" + statistics.dir.dispersion.toFixed(PRECISION) + "</td>",
      "  <td>" + statistics.dir.confidence.toFixed(PRECISION) + "</td>",
      "  <td>" + statistics.pole.dispersion.toFixed(PRECISION) + "</td>",
      "  <td>" + statistics.pole.confidence.toFixed(PRECISION) + "</td>",
      "  <td>" + statistics.pole.confidenceMin.toFixed(PRECISION) + "</td>",
      "  <td>" + statistics.pole.confidenceMax.toFixed(PRECISION) + "</td>",
      "  <td>" + statistics.butler.dDx.toFixed(PRECISION) + "</td>",
      "  <td>" + statistics.butler.dIx.toFixed(PRECISION) + "</td>",
      "  <td>" + statistics.dir.lambda.toFixed(PRECISION) + "</td>",
      "</tr>"
    ].join("\n"));

  });

  eqAreaChart(CHART_CONTAINER, dataSeries);

  document.getElementById("mean-table").innerHTML = [
    "  <caption>Statistical parameters for the selected collections.</caption>",
    "  <thead>",
    "  <tr>",
    "    <td>Collection</td>",
    "    <td>N</td>",
    "    <td>Ns</td>",
    "    <td>Cutoff</td>",
    "    <td>S</td>",
    "    <td>Dec</td>",
    "    <td>Inc</td>",
    "    <td>R</td>",
    "    <td>k</td>",
    "    <td>a95</td>",
    "    <td>K</td>",
    "    <td>A95</td>",
    "    <td>A95min</td>",
    "    <td>A95max</td>",
    "    <td>ΔDx</td>",
    "    <td>ΔIx</td>",
    "    <td>λ</td>",
    "  </tr>",
    "  </thead>",
    "  <tbody>",
  ].concat(statisticsRows).join("\n");

}

function eqAreaProjection() {

  /* 
   * Function eqAreaProjection
   * Description: Handles plotting for equal area projection
   */

  const CHART_CONTAINER = "direction-container";
  const CHART_CONTAINER2 = "pole-container";

  // Get a list of the selected sites
  var allComponents = doCutoff(getSelectedComponents());
  var statistics = getStatisticalParameters(allComponents.components);

  var dataSeries = new Array();
  var dataSeriesPole = new Array();

  var baseSite = new Site(0, 0);

  // Add each component
  allComponents.components.forEach(function(component) {

    // Go over each step
    var direction = literalToCoordinates(component.coordinates).toVector(Direction);
    
    var color;
    if(component.rejected) {
      color = HIGHCHARTS_RED;
    } else {
      color = HIGHCHARTS_BLUE;
    }

    dataSeries.push({
      "x": direction.dec, 
      "y": projectInclination(direction.inc), 
      "inc": direction.inc,
      "name": component.name,
      "marker": {
        "fillColor": (direction.inc < 0 ? HIGHCHARTS_WHITE : color),
        "lineWidth": 1,
        "lineColor": color
      }
    });

    var pole = baseSite.poleFrom(new Direction(direction.dec, direction.inc));

    // Simple rotation rotate all vectors with mean vector to up/north
    pole = pole.toCartesian().rotateTo(-statistics.pole.mean.lng, 90).rotateFrom(0, statistics.pole.mean.lat).rotateTo(statistics.pole.mean.lng, 90).toVector(Pole);

    dataSeriesPole.push({
      "x": pole.lng, 
      "y": projectInclination(pole.lat), 
      "inc": pole.lat, 
      "name": component.name,
      "marker": {
        "fillColor": (pole.lat < 0 ? HIGHCHARTS_WHITE : color),
        "lineWidth": 1,
        "lineColor": color
      }
    });      

  });

  // Get the confidence interval around the mean
  var A95Ellipse = getConfidenceEllipse(statistics.pole.confidence);

  var poleSeries = [{
    "name": "VGPs",
    "type": "scatter",
    "color": HIGHCHARTS_BLUE,
    "data": dataSeriesPole
  }, {
    "name": "Mean VGP",
    "type": "scatter",
    "color": HIGHCHARTS_GREEN,
    "marker": {
      "symbol": "circle",
      "radius": 6
    },
    "data":  [{
      "x": 0,
      "y": 90,
      "inc": 90
    }]
  }, {
    "name": "Confidence Ellipse",
    "type": "line",
    "color": HIGHCHARTS_RED,
    "data": A95Ellipse.map(prepareDirectionData),
    "enableMouseTracking": false,
    "marker": {
      "enabled": false
    }
  }];

  const ENABLE_DEENEN = true;

  if(ENABLE_DEENEN) {

    poleSeries.push({
      "name": "Deenen Criteria",
      "data": getConfidenceEllipse(statistics.pole.confidenceMax).map(prepareDirectionData),
      "type": "line",
      "color": HIGHCHARTS_ORANGE,
      "enableMouseTracking": false,
      "dashStyle": "ShortDash",
      "marker": { 
        "enabled": false
      } 
    }, {
      "linkedTo": ":previous",
      "data": getConfidenceEllipse(statistics.pole.confidenceMin).map(prepareDirectionData),
      "type": "line",
      "color": HIGHCHARTS_ORANGE,
      "enableMouseTracking": false,
      "dashStyle": "ShortDash",
      "marker": { 
        "enabled": false
      }
    });

  }

  const PRECISION = 2;

  document.getElementById("direction-table").innerHTML = [
    "  <caption>Statistical parameters for this distribution</caption>",
    "  <thead>",
    "  <tr>",
    "    <td>N</td>",
    "    <td>Ns</td>",
    "    <td>Cutoff</td>",
    "    <td>S</td>",
    "    <td>Dec</td>",
    "    <td>Inc</td>",
    "    <td>R</td>",
    "    <td>k</td>",
    "    <td>a95</td>",
    "    <td>K</td>",
    "    <td>A95</td>",
    "    <td>A95min</td>",
    "    <td>A95max</td>",
    "    <td>ΔDx</td>",
    "    <td>ΔIx</td>",
    "    <td>λ</td>",
    "  </tr>",
    "  </thead>",
    "  <tbody>",
    "  <tr>",
    "    <td>" + allComponents.components.filter(x => !x.rejected).length + "</td>",
    "    <td>" + allComponents.components.length + "</td>",
    "    <td>" + allComponents.cutoff.toFixed(PRECISION) + "</td>",
    "    <td>" + allComponents.scatter.toFixed(PRECISION) + "</td>",
    "    <td>" + statistics.dir.mean.dec.toFixed(PRECISION) + "</td>",
    "    <td>" + statistics.dir.mean.inc.toFixed(PRECISION) + "</td>",
    "    <td>" + statistics.dir.R.toFixed(PRECISION) + "</td>",
    "    <td>" + statistics.dir.dispersion.toFixed(PRECISION) + "</td>",
    "    <td>" + statistics.dir.confidence.toFixed(PRECISION) + "</td>",
    "    <td>" + statistics.pole.dispersion.toFixed(PRECISION) + "</td>",
    "    <td>" + statistics.pole.confidence.toFixed(PRECISION) + "</td>",
    "    <td>" + statistics.pole.confidenceMin.toFixed(PRECISION) + "</td>",
    "    <td>" + statistics.pole.confidenceMax.toFixed(PRECISION) + "</td>",
    "    <td>" + statistics.butler.dDx.toFixed(PRECISION) + "</td>",
    "    <td>" + statistics.butler.dIx.toFixed(PRECISION) + "</td>",
    "    <td>" + statistics.dir.lambda.toFixed(PRECISION) + "</td>",
    "  </tr>",
    "  </tbody>",
  ].join("\n");

  const A95_CONFIDENCE = true;

  if(A95_CONFIDENCE) {
    var a95ellipse = transformEllipse(A95Ellipse, statistics.dir);
  } else {
    var a95ellipse = getPlaneData(statistics.dir.mean, statistics.dir.confidence);
  }

  var directionSeries = [{
    "name": "ChRM Directions",
    "type": "scatter",
    "zIndex": 5,
    "color": HIGHCHARTS_BLUE,
    "data": dataSeries
  }, {
    "name": "Mean Direction",
    "data": new Array(statistics.dir.mean).map(prepareDirectionData),
    "type": "scatter",
    "color": HIGHCHARTS_GREEN,
    "marker": {
      "symbol": "circle",
      "radius": 6,
      "lineColor": HIGHCHARTS_GREEN,
      "lineWidth": 1,
      "fillColor": (statistics.dir.mean.inc < 0 ? HIGHCHARTS_WHITE : HIGHCHARTS_GREEN)
    }
  }, {
    "name": "Confidence Ellipse",
    "type": "line",
    "color": HIGHCHARTS_RED,
    "data": a95ellipse,
    "enableMouseTracking": false,
    "marker": {
      "enabled": false
    }
  }];

  var plotBands = eqAreaPlotBand(statistics.dir.mean.dec, statistics.butler.dDx);

  // Delegate to plotting routines
  eqAreaChart(CHART_CONTAINER, directionSeries, plotBands);
  eqAreaChart(CHART_CONTAINER2, poleSeries);

}

function transformEllipse(A95Ellipse, dir) {

  /*
   * Function transformEllipse
   * Transforms the A95 confidence ellipse to a direction
   */

  // Create a fake site at the location of the expected paleolatitude
  var site = new Site(0, Math.abs(dir.lambda));

  // Go over each point and transform VGP to direction at location
  var a95Ellipse = A95Ellipse.map(function(point) {
    return site.directionFrom(new Pole(point.dec, point.inc)).toCartesian().rotateTo(dir.mean.dec, 90).toVector(Direction);
  });

  return a95Ellipse.map(prepareDirectionData);

}

function eqAreaPlotBand(mDec, decError) {

  const PLOTBAND_COLOR = "rgba(119, 152, 191, 0.25)";

  var minError = mDec - decError;
  var maxError = mDec + decError;

  var plotBands = [{
    "from": minError,
    "to": maxError,
    "color": PLOTBAND_COLOR,
    "innerRadius": "0%",
    "thickness": "100%",
  }];

  // Plotbands in polar charts cannot go below through North (e.g. 350 - 10)
  // so we go from (360 - 10) and (350 - 360) instead 
  if(minError < 0) {
    plotBands.push({
      "from": 360,
      "to": minError + 360,
      "color": PLOTBAND_COLOR,
      "innerRadius": "0%",
      "thickness": "100%",
    });
  }
  
  if(maxError > 360) {
    plotBands.push({
      "from": 0,
      "to": maxError - 360,
      "color": PLOTBAND_COLOR,
      "innerRadius": "0%",
      "thickness": "100%",
    });
  }
  
  return plotBands;

}

function prepareDirectionData(direction) {

  /*
   * Function prepareDirectionData
   * Prepared a direction for plotting by projecting the inclination
   */

  return {
    "x": direction.dec, 
    "y": projectInclination(direction.inc),
    "inc": direction.inc
  }

}

function eqAreaChart(container, dataSeries, plotBands) {

  /*
   * Function eqAreaChart
   * Creates an equal area chart
   */

  const ENABLE_45_CUTOFF = true;

  var title;
  if(container === "pole-container") {
    title = "VGP Distribution";
  } else if(container === "direction-container") {
    title = "ChRM Distribution";
  } else if(container === "mean-container") {
    title = "Mean Directions";
  } else if(container === "foldtest-geographic-container") {
    title = "Geographic Coordinates";
  } else if(container === "foldtest-tectonic-container") {
    title = "Tectonic Coordinates";
  }

  var subtitle;
  if(container === "foldtest-geographic-container") {
    subtitle = "";
  } else if(container === "foldtest-tectonic-container") {
    subtitle = "";
  } else {
    subtitle = "(" + COORDINATES + " coordinates)";
  }

  Highcharts.chart(container, {
    "chart": {
      "polar": true,
      "animation": false,
      "height": 600,
      "width": 600
    },
    "exporting": {
      "filename": "hemisphere-projection",
      "sourceWidth": 600,
      "sourceHeight": 600,
      "buttons": {
        "contextButton": {
          "symbolStroke": HIGHCHARTS_BLUE,
          "align": "right"
        }
      }
    },
    "title": {
      "text": title
    },
    "subtitle": {
      "text": subtitle
    },
    "pane": {
      "startAngle": 0,
      "endAngle": 360
    },
    "yAxis": {
      "type": "linear",
      "reversed": true,
      "labels": {
        "enabled": false
      },
      "tickInterval": (ENABLE_45_CUTOFF ? 45 : 90),
      "min": 0,
      "max": 90,
    },
    "credits": {
      "enabled": ENABLE_CREDITS,
      "text": "Paleomagnetism.org (Equal Area Projection)",
      "href": ""
    },
    "xAxis": {
      "minorTickPosition": "inside",
      "type": "linear",
      "min": 0,
      "max": 360,
      "minorGridLineWidth": 0,
      "tickPositions": [0, 90, 180, 270, 360],
      "minorTickInterval": 10,
      "minorTickLength": 5,
      "minorTickWidth": 1,
      "plotBands": plotBands
    },
    "tooltip": {
      "formatter": generateHemisphereTooltip
    },
    "plotOptions": {
      "line": {
        "lineWidth": 1,
        "color": "rgb(119, 152, 191)"
      },
      "series": {
        "animation": false,
        "cursor": "pointer"
      }
    },
    "series": dataSeries
  });

}