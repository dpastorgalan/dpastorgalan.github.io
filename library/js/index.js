var map;
const greenIcon = new L.Icon({
  iconUrl: "../resources/images/markers/green.png",
  shadowUrl: "../resources/images/markers/shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

document.getElementById("pid-lookup-button").addEventListener("click", quickPID);

function loadDigitalObjects() {

  /*
   * Function loadDigitalObjects
   * Loads all digital objects from disk
   */

  // Load the information from a JSON
  HTTPRequest("../resources/publications.json", "GET", function(publications) {

    // Problem getting the publications
    if(publications === null) {
      return notify("danger", "Could not load the list of publications.");
    }

    // Update the map and table with the returned collections
    addCollectionsToMap(publications);
    addCollectionsToTable(publications);

  });

}

function addCollectionsToTable(publications) {

  /*
   * Function addCollectionsToTable
   * Adds the returned publications to a table
   */

  const TABLE_CONTAINER = "publication-table";

  var rows = publications.map(function(x) {
    return [
      "<tr>",
      "  <td>" + x.name + "</td>",
      "  <td>" + x.author + "</td>",
      "  <td>" + x.institution + "</td>",
      "  <td>" + x.description + "</td>",
      "  <td><code><a href='../publication/index.html?" + x.pid + "'>" + x.pid.slice(0, 16) + "…</a></code></td>",
      "  <td>" + (x.doi || "N/A") + "</td>",
      "  <td>" + new Date(x.created).toISOString().slice(0, 10) + "</td>",
      "</tr>"
    ].join("\n");
  });

  // Update the table container
  document.getElementById(TABLE_CONTAINER).innerHTML = [
    "<head>",
    "  <tr>",
    "    <th>Name</th>",
    "    <th>Author</th>",
    "    <th>Institution</th>",
    "    <th>Description</th>",
    "    <th>Persistent Identifier</th>",
    "    <th>DOI</th>",
    "    <th>Created</th>",
    "  </tr>",
    "</head>",
  ].concat(rows).join("\n");

}

function addMap() {

  /*
   * Function addMap
   * Adds map to the application
   */

  const MAP_CONTAINER = "map";
  const TILE_LAYER = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const VIEWPORT = new L.latLng(35, 0);

  // Set map options (bounds)
  var mapOptions = {
    "minZoom": 1,
    "maxBounds": new L.latLngBounds(new L.latLng(-90, -180), new L.latLng(90, 180)),
    "maxBoundsViscosity": 0.5,
    "attributionControl": true
  }

  // Create the map and tile layer
  map = L.map(MAP_CONTAINER, mapOptions).setView(VIEWPORT, 1);
  L.tileLayer(TILE_LAYER).addTo(map);

}

function addCollectionsToMap(publications) {

  /*
   * Function addCollectionsToMap
   * Adds collections from the library to the map
   */

  function addPublication(publication, index) {

    /*
     * Function addCollectionsToMap::addPublication
     * Adds a single publication marker to the map
     */

    function createTooltip(publication) {
  
      /*
       * Function addCollectionsToMap::addPublication::createTooltip
       * Creates a tooltip for the marker
       */
  
      return new Array(
        "<b>" + publication.name + "</b>",
        "<i>" + publication.description + "</i>",
        "",
        "Publication contains " + publication.nSpecimens + " specimens from " + publication.nCollections + " collections.",
        "",
        "<b>Author</b>: " + publication.author,
        "<b>Published</b>: " + publication.created,
        "",
        "<a href='../publication/index.html?" + publication.pid +"'><b>View Publication</b></a>"
      ).join("<br>");

    }

    // Add the publication index so we can track it
    const marker = new L.Marker(L.latLng(publication.location), {"index": index});

    // Show and hide the publication convex hull
    marker.on("mouseover", showConvexHull);
    marker.on("mouseout", hideConvexHull)
    marker.bindPopup(createTooltip(publication));
    marker.addTo(map);

  }

  function hideConvexHull() {

    /*
     * Function addCollectionsToMap::hideConvexHull
     * Hides the convex hull of a publication
     */

    map.removeLayer(convexHullRef);

  }

  function showConvexHull() {

    /*
     * Function addCollectionsToMap::hideConvexHull
     * Hides the convex hull of a publication
     */

    // Save reference
    convexHullRef = new L.polygon(publications[this.options.index].convexHull.map(x => new L.LatLng(x.lat, x.lng)), {"color": HIGHCHARTS_BLUE}).addTo(map);

  }

  // Save references to the open hull
  let convexHullRef;

  // Add all the publications
  publications.forEach(addPublication);

}

function quickPID() {

  /*
   * Function quickPID
   * Quickly looks up a Paleomagnetism.org 2 persistent identifier
   */

  let PIDValue = document.getElementById("pid-lookup").value;

  // Extract the publication, coordinate, and specimen identifier
  var [publication, collection, specimen] = PIDValue.split(".");

  // Confirm identifier before resolution and resolve to correct page
  if(publication !== "") {
    if(collection !== undefined) {
      if(specimen !== undefined) {
        return window.location = "../specimen/index.html?" + PIDValue;
      }
      return window.location = "../collection/index.html?" + PIDValue;
    }
    return window.location = "../publication/index.html?" + PIDValue;
  }

  // Not a correct PID?
  return notify("danger", "The submitted identifier is not valid and could not be resolved.");

}

function __init__() {

  addMap();

  // Load all publications from JSON
  loadDigitalObjects();

}

__init__();