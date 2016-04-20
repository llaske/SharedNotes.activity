define(function (require) {
	var l10n = require("webL10n");
	var activity = require("sugar-web/activity/activity");
	var datastore = require("sugar-web/datastore");
	var notepalette = require("notepalette");
	var zoompalette = require("zoompalette");
	var defaultColor = '#FFF29F';

	// Manipulate the DOM only when it is ready.
	require(['domReady!'], function (doc) {

		// Initialize the activity.
		activity.setup();

		// Handle toolbar mode switch
		var currentMode = 0;
		var nodetextButton = document.getElementById("nodetext-button");
		var removeButton = document.getElementById("delete-button");
		var switchMode = function(newMode) {
			currentMode = newMode;
			nodetextButton.classList.remove('active');
			removeButton.classList.remove('active');
			if (newMode == 0) nodetextButton.classList.add('active');
			else if (newMode == 2) removeButton.classList.add('active');
			if (lastSelected != null) {
				unselectAllNode();
				lastSelected = null;
			}
		}
		nodetextButton.addEventListener('click', function () { switchMode(0); }, true);
		removeButton.addEventListener('click', function () { switchMode(2); }, true);
		var colorButton = document.getElementById("color-button");
		colorPalette = new notepalette.NotePalette(colorButton);
		colorPalette.setColor('rgb(255, 242, 159)');
		colorPalette.addEventListener('colorChange', function(e) {
			lastSelected.style('background-color', e.detail.color);
			lastSelected.data('background-color', e.detail.color);
			defaultColor = e.detail.color;
			pushState();
		});
		var zoomButton = document.getElementById("zoom-button");
		zoomPalette = new zoompalette.zoomPalette(zoomButton);
		zoomPalette.addEventListener('pop', function(e) {
		});
		zoomPalette.addEventListener('zoom', function(e) {
			var action = e.detail.zoom;
			var currentZoom = cy.zoom();
			var zoomStep = 0.25;
			if (action == 0) {
				if (currentZoom != cy.minZoom() && currentZoom-zoomStep > cy.minZoom()) cy.zoom(currentZoom-zoomStep);
			} else if (action == 1) {
				if (currentZoom != cy.maxZoom()) cy.zoom(currentZoom+zoomStep);
			} else if (action == 2) {
				cy.fit();
			} else if (action == 3) {
				cy.center();
			}
		});
		var pngButton = document.getElementById("png-button");
		pngButton.addEventListener('click', function(e) {
			var inputData = cy.png();
			var mimetype = inputData.split(";")[0].split(":")[1];
			var type = mimetype.split("/")[0];
			var metadata = {
				mimetype: mimetype,
				title: type.charAt(0).toUpperCase() + type.slice(1) + " Shared Notes",
				activity: "org.olpcfrance.MediaViewerActivity",
				timestamp: new Date().getTime(),
				creation_time: new Date().getTime(),
				file_size: 0
			};
			datastore.create(metadata, function() {
				console.log("export done.")
			}, inputData);
		});

		// Handle graph save/world
		var stopButton = document.getElementById("stop-button");
		stopButton.addEventListener('click', function (event) {
			console.log("writing...");
			saveGraph(function (error) {
				if (error === null) {
					console.log("write done.");
				}
				else {
					console.log("write failed.");
				}
			});
		});

		// Handle localization
		window.addEventListener('localized', function() {
			var navigatorLanguage = navigator.language;
			if (navigatorLanguage) {
				if (navigatorLanguage.indexOf("fr") != -1)
					l10n.locale = "fr";
				else if (navigatorLanguage.indexOf("es") != -1)
					l10n.locale = "es";
			}
			defaultText = l10n.get("YourNewIdea");
			nodetextButton.title = l10n.get("nodetextTitle");
			removeButton.title = l10n.get("removeButtonTitle");
			undoButton.title = l10n.get("undoButtonTitle");
			redoButton.title = l10n.get("redoButtonTitle");
			zoomButton.title = l10n.get("zoomButtonTitle");
			pngButton.title = l10n.get("pngButtonTitle");
		}, false);

		// --- Node and edge handling functions
		var nodeCount = 0;
		var defaultFontFamily = "Arial";
		var defaultFontSize = 16;
		var lastSelected = null;
		var defaultText = "<Your content>";
		var textValue = document.getElementById("textvalue");
		textValue.addEventListener('click', function (event) {
			hideEditField();
			updateNodeText(lastSelected, textValue.value);
			unselectNode(lastSelected);
		});

		// Create a new node with text and position
		var createNode = function(text, position) {
			cy.add({
				group: 'nodes',
				nodes: [
					{
						data: {
							id: 'n'+(++nodeCount),
							'content': text,
							'color': 'rgb(0, 0, 0)'
						},
						position: {
							x: position.x,
							y: position.y
						}
					}
				]
			});
			var newnode = cy.getElementById('n'+nodeCount);
			newnode.style({
				'content': text,
				'background-color': defaultColor				
			});
			newnode.addClass('standard-node');
			return newnode;
		}

		// Update node text and change size
		var updateNodeText = function(node, text) {
			if (text === undefined) text = node.style()['content'];
			else node.data('content', text);
			node.style({
				'content': text
			});
		}

		// Test if node is selected
		var isSelectedNode = function(node) {
			return node.style()['border-style'] == 'dashed';
		}

		// Set node as selected
		var selectNode = function(node) {
			node.style({
				'border-color': 'black',
				'border-style': 'dashed',
				'border-width': '4px'
			});
		}

		// Set node as unselected
		var unselectNode = function(node) {
			node.style({
				'border-color': 'darkgray',
				'border-style': 'solid',
				'border-width': '1px'
			});
		}

		// Unselect all node
		var unselectAllNode = function() {
			var nodes = cy.collection("node");
			for (var i = 0 ; i < nodes.length ; i++) {
				unselectNode(nodes[i]);
			}
		}

		// Delete node, linked edges are removed too
		var deleteNode = function(node) {
			cy.remove(node);
		}

		// --- Utility functions

		// Show edit field 
		var showEditField = function(node) {
			var position = node.renderedPosition();
			var zoom = cy.zoom();					
			textValue.value = node.data('content');
			textValue.style.visibility = "visible";
			textValue.style.backgroundColor = node.style().backgroundColor;
			var delta = 100 * zoom - 200 * zoom;
			textValue.style.left = (position.x + delta) + "px";
			textValue.style.top = (55 + position.y + delta) + "px";
			textValue.style.width = 190 * zoom + "px";
			textValue.style.height = 190 * zoom + "px";
			textValue.setSelectionRange(textValue.value.length, textValue.value.length);
			textValue.focus();
		}
		
		// Hide edit field
		var hideEditField = function() {
			textvalue.style.visibility = "hidden";
		}
		
		// Get center of drawing zone
		var getCenter = function() {
			var canvas = document.getElementById("canvas");
			var center = {x: canvas.clientWidth/2, y: canvas.clientHeight/2};
			return center;
		}

		// Load graph from datastore
		var loadGraph = function() {
			var datastoreObject = activity.getDatastoreObject();
			datastoreObject.loadAsText(function (error, metadata, data) {
				if (data == null)
					return;
				displayGraph(data);
				reinitState();
				pushState();
			});
		}

		// Save graph to datastore
		var saveGraph = function(callback) {
			var datastoreObject = activity.getDatastoreObject();
			var jsonData = getGraph();
			datastoreObject.setDataAsText(jsonData);
			datastoreObject.save(callback);
		}

		// Get a deep copy of current Graph
		var deepCopy = function(o) {
			var copy = o,k;
			if (o && typeof o === 'object') {
				copy = Object.prototype.toString.call(o) === '[object Array]' ? [] : {};
				for (k in o) {
					copy[k] = deepCopy(o[k]);
				}
			}
			return copy;
		}
		var getGraph = function() {
			return deepCopy(cy.json());
		}

		// Display a saved graph
		var displayGraph = function(graph) {
			// Destroy the graph
			cy.remove("node");
			lastSelected = null;

			// Recreate nodes and set styles and text
			cy.add({
				group: 'nodes',
				nodes: graph.elements.nodes
			});
			var nodes = cy.collection("node");
			var maxCount = 0;
			for (var i = 0 ; i < nodes.length ; i++) {
				var newnode = nodes[i];
				updateNodeText(newnode, newnode.data('content'));
				newnode.style('color', newnode.data('color'));
				newnode.style('background-color', newnode.data('background-color'));
				var id = newnode.data('id').substr(1);
				if (id > maxCount) maxCount = id;
			}
			nodeCount = maxCount+1;
		}

		// Do/Undo handling
		var stateHistory = [];
		var stateIndex = 0;
		var maxHistory = 30;
		var undoButton = document.getElementById("undo-button");
		undoButton.addEventListener('click', function () { undoState(); }, true);
		var redoButton = document.getElementById("redo-button");
		redoButton.addEventListener('click', function () { redoState(); }, true);

		var reinitState = function() {
			stateHistory = [];
			stateIndex = 0;
		}

		var pushState = function() {
			if (stateIndex < stateHistory.length - 1) {
				var stateCopy = [];
				for (var i = 0 ; i < stateIndex + 1; i++)
					stateCopy.push(stateHistory[i]);
				stateHistory = stateCopy;
			}
			var stateLength = stateHistory.length - 1;
			var currentState = getGraph();
			if (stateLength < maxHistory) stateHistory.push(currentState);
			else {
				for (var i = 0 ; i < stateLength-1 ; i++) {
					stateHistory[i] = stateHistory[i+1];
				}
				stateHistory[stateLength-1] = currentState;
			}
			stateIndex = stateHistory.length - 1;
			updateStateButtons();
		}

		var undoState = function() {
			if (stateHistory.length < 1 || (stateHistory.length >= 1 && stateIndex == 0)) return;
			displayGraph(stateHistory[--stateIndex]);
			updateStateButtons();
		}

		var redoState = function() {
			if (stateIndex+1 >= stateHistory.length) return;
			displayGraph(stateHistory[++stateIndex]);
			updateStateButtons();
		}

		var updateStateButtons = function() {
			var stateLength = stateHistory.length;
			undoButton.disabled = (stateHistory.length < 1 || (stateHistory.length >= 1 && stateIndex == 0));
			redoButton.disabled = (stateIndex+1 >= stateLength);
		}

		// --- Cytoscape handling

		// Initialize board
		cy = cytoscape({
			container: document.getElementById('cy'),

			ready: function() {
				// Create first node and select id
				cy = this;
				var firstNode = createNode(defaultText, getCenter());
				firstNode.select();
				selectNode(firstNode);
				lastSelected = firstNode;
				pushState();

				// Load world
				loadGraph();
			},

			style: [
				{
					selector: '.standard-node',
					css: {
						'width': '200px',
						'height': '200px',
						'text-valign': 'center',
						'text-halign': 'center',
						'border-color': 'darkgray',
						'border-width': '1px',
						'background-color': defaultColor,
						'text-wrap': 'wrap',
						'text-max-width': '200px',
						'shadow-color': 'black',
						'shadow-offset-x': '4px',
						'shadow-offset-y': '4px',
						'shadow-opacity': '0.5',
						'shape': 'rectangle'
					}
				}
			]
		});

		// Event: a node is selected
		cy.on('tap', 'node', function() {
			if (currentMode == 2) {
				deleteNode(this);
				pushState();
				if (lastSelected == this) lastSelected = null;
				return;
			} else {
				if (!isSelectedNode(this)) {
					if (lastSelected != null) {
						updateNodeText(lastSelected, textValue.value);
						unselectNode(lastSelected);
					}
					selectNode(this);
					showEditField(this);
				}
				lastSelected = this;
			}
		});

		// Event: a node is unselected
		cy.on('unselect', 'node', function() {
			unselectNode(this);
		});

		// Event: tap on the board
		cy.on('tap', function(e){
			if (e.cyTarget === cy) {
				if (currentMode == 0) {
					var newNode = createNode(defaultText, e.cyPosition);
					if (lastSelected != null) {
						unselectNode(lastSelected);
					}
					pushState();
					newNode.select();
					selectNode(newNode);
					lastSelected = newNode;
				}
			}
		});

		// Event: elements moved
		cy.on('free', 'node', function(e) {
			pushState();
		});

		// Event: zoom
		cy.on('zoom', function() {
			updateNodeText(lastSelected, textValue.value);		
			hideEditField();
			unselectNode(lastSelected);
		});
		
		// Event: move
		cy.on('pan', function() {
			updateNodeText(lastSelected, textValue.value);		
			hideEditField();
			unselectNode(lastSelected);
		});
	});
});
