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
			saveAndFinishEdit();
			if (newMode == 0) nodetextButton.classList.add('active');
			else if (newMode == 1) removeButton.classList.add('active');
			if (lastSelected != null) {
				unselectAllNode();
				lastSelected = null;
			}
		}
		nodetextButton.addEventListener('click', function () { switchMode(0); }, true);
		removeButton.addEventListener('click', function () { switchMode(1); }, true);
		var colorButton = document.getElementById("color-button");
		colorPalette = new notepalette.NotePalette(colorButton);
		colorPalette.setColor('rgb(255, 242, 159)');
		colorPalette.addEventListener('colorChange', function(e) {
			if (isSelectedNode(lastSelected)) {
				pushState({
					redo: {action:"update", id:lastSelected.id(), color: e.detail.color},
					undo: {action:"update", id:lastSelected.id(), color: lastSelected.data('background-color')}
				});
				lastSelected.style('background-color', e.detail.color);
				lastSelected.data('background-color', e.detail.color);
			}
			textValue.style.backgroundColor = e.detail.color;
			defaultColor = e.detail.color;
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
		var defaultFontFamily = "Arial";
		var defaultFontSize = 16;
		var lastSelected = null;
		var defaultText = "<Your content>";
		var textValue = document.getElementById("textvalue");
		var draggedPosition = null;
		textValue.addEventListener('click', function (event) {
			saveAndFinishEdit();
		});

		// Create a new node with text and position
		var createNode = function(id, text, position, color) {
			cy.add({
				group: 'nodes',
				nodes: [
					{
						data: {
							id: id,
							'content': text,
							'color': 'rgb(0, 0, 0)',
							'background-color': color
						},
						position: {
							x: position.x,
							y: position.y
						}
					}
				]
			});
			var newnode = cy.getElementById(id);
			newnode.style({
				'content': text,
				'background-color': color
			});
			newnode.addClass('standard-node');
			return newnode;
		}

		// Update node text and change size
		var updateNodeText = function(node, text) {
			if (node == null) return;
			var previous = node.data('content');
			if (text === undefined) text = node.style()['content'];
			else node.data('content', text);
			node.style({
				'content': text
			});
			if (previous != text) {
				pushState({
					redo: {action:"update", id:node.id(), text: text},
					undo: {action:"update", id:node.id(), text: previous}
				});
			}
		}

		// Test if node is selected
		var isSelectedNode = function(node) {
			if (node == null) return false;
			return node.style()['border-style'] == 'dashed';
		}

		// Set node as selected
		var selectNode = function(node) {
			if (node == null) return;
			node.style({
				'border-color': 'black',
				'border-style': 'dashed',
				'border-width': '4px'
			});
		}

		// Set node as unselected
		var unselectNode = function(node) {
			if (node == null) return;
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
			if (node == null) return;
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
			if (textValue.value == defaultText)
				textValue.setSelectionRange(0, textValue.value.length);
			else
				textValue.setSelectionRange(textValue.value.length, textValue.value.length);
			textValue.focus();
		}

		// Hide edit field
		var hideEditField = function() {
			textvalue.style.visibility = "hidden";
		}

		var saveAndFinishEdit = function() {
			if (lastSelected != null && isSelectedNode(lastSelected)) {
				updateNodeText(lastSelected, textValue.value);
				hideEditField();
				unselectNode(lastSelected);
			}
		}

		// Get center of drawing zone
		var getCenter = function() {
			var canvas = document.getElementById("canvas");
			var center = {x: canvas.clientWidth/2, y: canvas.clientHeight/2};
			return center;
		}

		// Generate a new id
		var newId = function() {
			var s = [];
			var hexDigits = "0123456789abcdef";
			for (var i = 0; i < 36; i++) {
				s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
			}
			s[14] = "4";
			s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1);
			s[8] = s[13] = s[18] = s[23] = "-";

			var uuid = s.join("");
			return uuid;
		}

		// Handle an update command from history or from the network
		var doAction = function(command) {
			if (command.action === undefined) return;
			else if (command.action == 'create') {
				// Create a new node
				createNode(command.id, command.text, command.position, command.color);
			} else if (command.action == 'delete') {
				// Get the node
				var node = cy.getElementById(command.id);
				if (node == null) return;

				// Delete it
				cy.remove(node);
			} else if (command.action == 'update') {
				// Get the node
				var node = cy.getElementById(command.id);
				if (node == null) return;

				// Update it
				if (command.text !== undefined) {
					node.data('content', command.text);
					node.style({'content': command.text});
				}
				if (command.color !== undefined) {
					node.data('background-color', command.color);
					node.style({'background-color': command.color});
				}
				if (command.position !== undefined) {
					node.position({
						x: command.position.x,
						y: command.position.y
					});
				}
			}
		}
		// Load graph from datastore
		var loadGraph = function() {
			var datastoreObject = activity.getDatastoreObject();
			datastoreObject.loadAsText(function (error, metadata, data) {
				if (data == null)
					return;
				cy.remove("node");
				lastSelected = null;
				for(var i = 0 ; i < data.length ; i++) {
					doAction(data[i]);
				}
				hideEditField();
				reinitState();
			});
		}

		// Save graph to datastore, generate command to rebuild each node
		var saveGraph = function(callback) {
			var datastoreObject = activity.getDatastoreObject();
			var nodes = cy.elements("node");
			var commands = [];
			for(var i = 0; i < nodes.length ; i++) {
				var node = nodes[i];
				commands.push({
					action:"create", id:node.id(), text: node.data("content"), position: {x: node.position().x, y: node.position().y}, color: node.data("background-color")
				});
			}
			datastoreObject.setDataAsText(commands);
			datastoreObject.save(callback);
		}

		// Do/Undo handling
		var stateHistory = [];
		var stateIndex = 0;
		var maxHistory = 30;
		var undoButton = document.getElementById("undo-button");
		undoButton.addEventListener('click', function () { saveAndFinishEdit(); undoState(); }, true);
		var redoButton = document.getElementById("redo-button");
		redoButton.addEventListener('click', function () { saveAndFinishEdit(); redoState(); }, true);

		var reinitState = function() {
			stateHistory = [];
			stateIndex = 0;
		}

		var pushState = function(state) {
			if (stateIndex < stateHistory.length - 1) {
				var stateCopy = [];
				for (var i = 0 ; i < stateIndex + 1; i++)
					stateCopy.push(stateHistory[i]);
				stateHistory = stateCopy;
			}
			var stateLength = stateHistory.length - 1;
			var currentState = state;
			if (stateLength < maxHistory) stateHistory.push(currentState);
			else {
				for (var i = 0 ; i < stateLength ; i++) {
					stateHistory[i] = stateHistory[i+1];
				}
				stateHistory[stateHistory.length-1] = currentState;
			}
			stateIndex = stateHistory.length - 1;
			updateStateButtons();
		}

		var undoState = function() {
			if (stateHistory.length < 1 || stateIndex < 0) return;
			var undo = stateHistory[stateIndex--].undo;
			doAction(undo);
			updateStateButtons();
		}

		var redoState = function() {
			if (stateIndex+1 >= stateHistory.length) return;
			var redo = stateHistory[++stateIndex].redo;
			doAction(redo);
			updateStateButtons();
		}

		var updateStateButtons = function() {
			var stateLength = stateHistory.length;
			undoButton.disabled = (stateHistory.length < 1 || stateIndex < 0);
			redoButton.disabled = (stateIndex+1 >= stateLength);
		}

		// --- Cytoscape handling

		// Initialize board
		cy = cytoscape({
			container: document.getElementById('cy'),

			ready: function() {
				// Create first node and select id
				cy = this;
				var firstNode = createNode(newId(), defaultText, getCenter(), defaultColor);
				pushState({
					redo: {action:"create", id:firstNode.id(), text: firstNode.data("content"), position: {x: firstNode.position().x, y: firstNode.position().y}, color: defaultColor},
					undo: {action:"delete", id:firstNode.id()}
				});
				firstNode.select();
				selectNode(firstNode);
				showEditField(firstNode);
				lastSelected = firstNode;

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
			if (currentMode == 1) {
				pushState({
					redo: {action:"delete", id:this.id()},
					undo: {action:"create", id:this.id(), text: this.data("content"), position: {x: this.position().x, y: this.position().y}, color: defaultColor}
				});
				deleteNode(this);
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
			saveAndFinishEdit();
			unselectNode(this);
		});

		// Event: tap on the board
		cy.on('tap', function(e){
			if (e.cyTarget === cy) {
				if (currentMode == 0) {
					var newNode = createNode(newId(), defaultText, e.cyPosition, defaultColor);
					pushState({
						redo: {action:"create", id:newNode.id(), text: newNode.data("content"), position: {x: newNode.position().x, y: newNode.position().y}, color: defaultColor},
						undo: {action:"delete", id:newNode.id()}
					});
					newNode.select();
					selectNode(newNode);
					showEditField(newNode);
					lastSelected = newNode;
				}
			}
		});

		// Event: elements moved
		cy.on('drag', 'node', function(e) {
			saveAndFinishEdit();
			if (draggedPosition == null) {
				draggedPosition = {x: this.position().x, y: this.position().y};
			}
		});

		cy.on('free', 'node', function(e) {
			if (draggedPosition != null && (this.position().x != draggedPosition.x || this.position().y != draggedPosition.y)) {
				pushState({
					redo: {action:"update", id:this.id(), position: {x: this.position().x, y: this.position().y}},
					undo: {action:"update", id:this.id(), position: {x: draggedPosition.x, y: draggedPosition.y}}
				});
			}
			draggedPosition = null;
		});

		// Event: zoom
		cy.on('zoom', function() {
			saveAndFinishEdit();
		});

		// Event: move
		cy.on('pan', function() {
			saveAndFinishEdit();
		});
	});
});
