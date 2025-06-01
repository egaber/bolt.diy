// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const express = require('express');
const cors = require('cors');

let server = null;
let serverPort = 3000;
let selectedModel = null;
let availableModels = [];

/**
 * Tree data provider for the Bolt DYI view
 */
class BoltTreeDataProvider {
	constructor() {
		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
		this.serverRunning = false;
	}

	refresh() {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element) {
		return element;
	}

	getChildren(element) {
		if (!element) {
			// Root items
			return [
				new BoltTreeItem(
					this.serverRunning ? 'Server Running' : 'Server Stopped', 
					this.serverRunning ? `LLM Bridge Server running on port ${serverPort}` : 'LLM Bridge Server is not running',
					vscode.TreeItemCollapsibleState.None,
					{
						command: this.serverRunning ? 'bolt-dyi-vsllm.stopServer' : 'bolt-dyi-vsllm.startServer',
						title: this.serverRunning ? 'Stop Server' : 'Start Server'
					},
					this.serverRunning ? 'stop' : 'play'
				),
				new BoltTreeItem('Open Chat Window', 'Open the LLM chat interface', vscode.TreeItemCollapsibleState.None, {
					command: 'bolt-dyi-vsllm.openChat',
					title: 'Open Chat'
				}, 'comment-discussion'),
				new BoltTreeItem('Select Model', 'Choose which LLM model to use', vscode.TreeItemCollapsibleState.None, {
					command: 'bolt-dyi-vsllm.selectModel',
					title: 'Select Model'
				}, 'settings-gear'),
				new BoltTreeItem('API Documentation', 'View available API endpoints', vscode.TreeItemCollapsibleState.None),
				new BoltTreeItem('Server Info', `Port: ${serverPort}`, vscode.TreeItemCollapsibleState.None, null, 'info')
			];
		}
		return [];
	}

	setServerRunning(running) {
		this.serverRunning = running;
		this.refresh();
	}
}

/**
 * Tree item for the Bolt DYI view
 */
class BoltTreeItem extends vscode.TreeItem {
	constructor(label, tooltip, collapsibleState, command, iconName = 'zap') {
		super(label, collapsibleState);
		this.tooltip = tooltip;
		this.description = '';
		this.command = command;
		this.iconPath = new vscode.ThemeIcon(iconName);
	}
}

/**
 * Create and configure the Express server
 */
function createServer() {
	const app = express();
	
	// Middleware
	app.use(cors());
	app.use(express.json({ limit: '10mb' }));
	
	// Health check endpoint
	app.get('/health', (req, res) => {
		res.json({ 
			status: 'ok', 
			timestamp: new Date().toISOString(),
			extension: 'bolt-dyi-vsllm'
		});
	});

	// Get available models endpoint
	app.get('/api/models', async (req, res) => {
		try {
			const models = await vscode.lm.selectChatModels();
			const modelInfo = models.map(model => ({
				id: model.id,
				vendor: model.vendor,
				family: model.family,
				name: model.name,
				maxInputTokens: model.maxInputTokens,
				countTokens: !!model.countTokens
			}));
			
			res.json({
				success: true,
				models: modelInfo,
				count: modelInfo.length
			});
		} catch (error) {
			console.error('Error getting models:', error);
			res.status(500).json({
				success: false,
				error: error.message
			});
		}
	});

	// Chat completion endpoint
	app.post('/api/chat', async (req, res) => {
		try {
			const { messages, model: requestedModel, options = {} } = req.body;
			
			if (!messages || !Array.isArray(messages)) {
				return res.status(400).json({
					success: false,
					error: 'Messages array is required'
				});
			}

			// Select model
			let models;
			if (requestedModel) {
				// Try to select specific model
				models = await vscode.lm.selectChatModels({ 
					id: requestedModel.id,
					vendor: requestedModel.vendor,
					family: requestedModel.family 
				});
			} else {
				// Get any available model
				models = await vscode.lm.selectChatModels();
			}

			if (models.length === 0) {
				return res.status(404).json({
					success: false,
					error: 'No language models available'
				});
			}

			const model = models[0];
			
			// Convert messages to VS Code format
			const chatMessages = messages.map(msg => {
				return vscode.LanguageModelChatMessage.User(msg.content);
			});

			// Create cancellation token
			const source = new vscode.CancellationTokenSource();
			const token = source.token;

			// Send request
			const response = await model.sendRequest(chatMessages, options, token);
			
			// Collect response
			let fullResponse = '';
			for await (const part of response.stream) {
				if (part instanceof vscode.LanguageModelTextPart) {
					fullResponse += part.value;
				}
			}

			res.json({
				success: true,
				response: fullResponse,
				model: {
					id: model.id,
					vendor: model.vendor,
					family: model.family,
					name: model.name
				}
			});

		} catch (error) {
			console.error('Error in chat completion:', error);
			res.status(500).json({
				success: false,
				error: error.message
			});
		}
	});

	// API documentation endpoint
	app.get('/api/docs', (req, res) => {
		res.json({
			name: 'VS Code LLM Bridge API',
			version: '1.0.0',
			endpoints: {
				'GET /health': 'Health check',
				'GET /api/models': 'Get available language models',
				'POST /api/chat': 'Send chat completion request',
				'GET /api/docs': 'This documentation'
			},
			chatEndpoint: {
				url: 'POST /api/chat',
				body: {
					messages: [
						{ content: 'Your message here' }
					],
					model: {
						id: 'optional-model-id',
						vendor: 'optional-vendor',
						family: 'optional-family'
					},
					options: {}
				}
			}
		});
	});

	return app;
}

/**
 * Start the HTTP server
 */
async function startServer(treeDataProvider) {
	if (server) {
		vscode.window.showWarningMessage('Server is already running!');
		return;
	}

	try {
		const app = createServer();
		
		server = app.listen(serverPort, 'localhost', () => {
			const message = `LLM Bridge Server started on http://localhost:${serverPort}`;
			console.log(message);
			vscode.window.showInformationMessage(message);
			treeDataProvider.setServerRunning(true);
		});

		server.on('error', (error) => {
			if (error.code === 'EADDRINUSE') {
				serverPort = serverPort + 1;
				console.log(`Port ${serverPort - 1} is busy, trying ${serverPort}`);
				server = app.listen(serverPort, 'localhost', () => {
					const message = `LLM Bridge Server started on http://localhost:${serverPort}`;
					console.log(message);
					vscode.window.showInformationMessage(message);
					treeDataProvider.setServerRunning(true);
				});
			} else {
				console.error('Server error:', error);
				vscode.window.showErrorMessage(`Failed to start server: ${error.message}`);
				server = null;
			}
		});

	} catch (error) {
		console.error('Error starting server:', error);
		vscode.window.showErrorMessage(`Failed to start server: ${error.message}`);
		server = null;
	}
}

/**
 * Stop the HTTP server
 */
function stopServer(treeDataProvider) {
	if (server) {
		server.close(() => {
			const message = 'LLM Bridge Server stopped';
			console.log(message);
			vscode.window.showInformationMessage(message);
			server = null;
			treeDataProvider.setServerRunning(false);
		});
	} else {
		vscode.window.showWarningMessage('Server is not running!');
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Bolt DYI VS LLM Bridge extension is now active!');

	// Create tree data providers
	const treeDataProvider = new BoltTreeDataProvider();
	const chatTreeDataProvider = new ChatTreeDataProvider();

	// Register the tree data providers
	vscode.window.registerTreeDataProvider('bolt-dyi-vsllm-view', treeDataProvider);
	vscode.window.registerTreeDataProvider('bolt-dyi-vsllm-chat', chatTreeDataProvider);

	// Register start server command
	const startServerCommand = vscode.commands.registerCommand('bolt-dyi-vsllm.startServer', () => {
		startServer(treeDataProvider);
	});

	// Register stop server command
	const stopServerCommand = vscode.commands.registerCommand('bolt-dyi-vsllm.stopServer', () => {
		stopServer(treeDataProvider);
	});

	// Register refresh command
	const refreshCommand = vscode.commands.registerCommand('bolt-dyi-vsllm.refreshView', () => {
		treeDataProvider.refresh();
		vscode.window.showInformationMessage('Bolt DYI view refreshed!');
	});

	context.subscriptions.push(startServerCommand);
	context.subscriptions.push(stopServerCommand);
	context.subscriptions.push(refreshCommand);

	// Auto-start server on activation
	startServer(treeDataProvider);

	// Register chat webview provider
	const chatWebviewProvider = new ChatWebviewProvider(context);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider('bolt-dyi-vsllm-webview', chatWebviewProvider));

	// Register open chat command
	const openChatCommand = vscode.commands.registerCommand('bolt-dyi-vsllm.openChat', () => {
		// Focus on the webview
		vscode.commands.executeCommand('workbench.view.extension.bolt-dyi-vsllm');
		// Then focus on the webview panel
		if (chatWebviewProvider._view) {
			chatWebviewProvider._view.show();
		}
	});

	// Register select model command
	const selectModelCommand = vscode.commands.registerCommand('bolt-dyi-vsllm.selectModel', async () => {
		try {
			const models = await vscode.lm.selectChatModels();
			if (models.length === 0) {
				vscode.window.showWarningMessage('No language models available.');
				return;
			}

			const modelItems = models.map(model => ({
				label: `${model.name}`,
				description: `${model.vendor} - ${model.family}`,
				detail: `Max tokens: ${model.maxInputTokens || 'Unknown'}`,
				model: {
					id: model.id,
					vendor: model.vendor,
					family: model.family,
					name: model.name,
					maxInputTokens: model.maxInputTokens
				}
			}));

			const selected = await vscode.window.showQuickPick(modelItems, {
				placeHolder: 'Select a language model',
				matchOnDescription: true,
				matchOnDetail: true
			});

			if (selected) {
				selectedModel = selected.model;
				chatTreeDataProvider.updateModel();
				vscode.window.showInformationMessage(`Selected model: ${selected.model.name}`);
				
				// Update webview if it exists
				if (chatWebviewProvider._view) {
					chatWebviewProvider._view.webview.postMessage({
						command: 'modelSelected',
						model: selectedModel
					});
				}
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Error selecting model: ${error.message}`);
		}
	});

	context.subscriptions.push(openChatCommand);
	context.subscriptions.push(selectModelCommand);
}

// This method is called when your extension is deactivated
function deactivate() {
	if (server) {
		server.close();
		server = null;
	}
}

/**
 * Tree data provider for the Chat view
 */
class ChatTreeDataProvider {
	constructor() {
		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
	}

	refresh() {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element) {
		return element;
	}

	getChildren(element) {
		if (!element) {
			// Root items
			return [
				new BoltTreeItem('Start Chat', 'Open chat window', vscode.TreeItemCollapsibleState.None, {
					command: 'bolt-dyi-vsllm.openChat',
					title: 'Open Chat'
				}, 'comment-discussion'),
				new BoltTreeItem('Select Model', 'Choose LLM model', vscode.TreeItemCollapsibleState.None, {
					command: 'bolt-dyi-vsllm.selectModel',
					title: 'Select Model'
				}, 'settings-gear'),
				new BoltTreeItem(selectedModel ? `Current: ${selectedModel.name}` : 'No model selected', 
					selectedModel ? `${selectedModel.vendor} - ${selectedModel.family}` : 'Click "Select Model" to choose', 
					vscode.TreeItemCollapsibleState.None, null, 'info')
			];
		}
		return [];
	}

	updateModel() {
		this.refresh();
	}
}

/**
 * Chat webview provider for the LLM chat interface
 */
class ChatWebviewProvider {
	constructor(context) {
		this._context = context;
		this._view = null;
	}

	resolveWebviewView(webviewView) {
		this._view = webviewView;
		
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._context.extensionUri]
		};

		webviewView.webview.html = this._getHtmlContent();
		
		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(async (message) => {
			switch (message.command) {
				case 'sendMessage':
					await this._handleSendMessage(message.text);
					break;
				case 'getModels':
					await this._handleGetModels();
					break;
				case 'selectModel':
					selectedModel = message.model;
					webviewView.webview.postMessage({
						command: 'modelSelected',
						model: selectedModel
					});
					break;
			}
		});

		// Initialize with available models
		this._loadModels();
	}

	async _loadModels() {
		try {
			const models = await vscode.lm.selectChatModels();
			availableModels = models.map(model => ({
				id: model.id,
				vendor: model.vendor,
				family: model.family,
				name: model.name,
				maxInputTokens: model.maxInputTokens
			}));

			if (this._view && availableModels.length > 0 && !selectedModel) {
				selectedModel = availableModels[0];
			}

			if (this._view) {
				this._view.webview.postMessage({
					command: 'modelsLoaded',
					models: availableModels,
					selectedModel: selectedModel
				});
			}
		} catch (error) {
			console.error('Error loading models:', error);
			if (this._view) {
				this._view.webview.postMessage({
					command: 'error',
					message: `Error loading models: ${error.message}`
				});
			}
		}
	}

	async _handleGetModels() {
		await this._loadModels();
	}

	async _handleSendMessage(text) {
		if (!this._view) return;

		try {
			if (!selectedModel) {
				this._view.webview.postMessage({
					command: 'error',
					message: 'No model selected. Please select a model first.'
				});
				return;
			}

			// Show thinking indicator
			this._view.webview.postMessage({
				command: 'thinking',
				message: 'Thinking...'
			});

			// Get the selected model
			const models = await vscode.lm.selectChatModels({
				id: selectedModel.id,
				vendor: selectedModel.vendor,
				family: selectedModel.family
			});

			if (models.length === 0) {
				this._view.webview.postMessage({
					command: 'error',
					message: 'Selected model is not available.'
				});
				return;
			}

			const model = models[0];
			const messages = [vscode.LanguageModelChatMessage.User(text)];
			
			// Create cancellation token
			const source = new vscode.CancellationTokenSource();
			const token = source.token;

			// Send request
			const response = await model.sendRequest(messages, {}, token);
			
			// Collect response
			let fullResponse = '';
			for await (const part of response.stream) {
				if (part instanceof vscode.LanguageModelTextPart) {
					fullResponse += part.value;
				}
			}

			// Send response back to webview
			this._view.webview.postMessage({
				command: 'response',
				message: fullResponse,
				model: {
					name: model.name,
					vendor: model.vendor,
					family: model.family
				}
			});

		} catch (error) {
			console.error('Error in chat:', error);
			this._view.webview.postMessage({
				command: 'error',
				message: `Error: ${error.message}`
			});
		}
	}

	_getHtmlContent() {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>LLM Chat</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			padding: 10px;
			margin: 0;
			background-color: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
		}
		
		.chat-container {
			display: flex;
			flex-direction: column;
			height: 100vh;
		}
		
		.model-selector {
			margin-bottom: 10px;
			padding: 10px;
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
		}
		
		.model-selector select {
			width: 100%;
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			padding: 5px;
			border-radius: 3px;
		}
		
		.chat-messages {
			flex: 1;
			overflow-y: auto;
			padding: 10px;
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			margin-bottom: 10px;
			background-color: var(--vscode-input-background);
			min-height: 200px;
		}
		
		.message {
			margin-bottom: 15px;
			padding: 8px 12px;
			border-radius: 8px;
			word-wrap: break-word;
		}
		
		.user-message {
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			margin-left: 20px;
		}
		
		.assistant-message {
			background-color: var(--vscode-editor-background);
			border: 1px solid var(--vscode-input-border);
			margin-right: 20px;
		}
		
		.error-message {
			background-color: var(--vscode-errorBackground);
			color: var(--vscode-errorForeground);
			border: 1px solid var(--vscode-errorBorder);
		}
		
		.thinking-message {
			background-color: var(--vscode-editor-background);
			border: 1px solid var(--vscode-input-border);
			margin-right: 20px;
			font-style: italic;
			opacity: 0.7;
		}
		
		.input-container {
			display: flex;
			gap: 10px;
		}
		
		.input-container input {
			flex: 1;
			padding: 8px;
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
		}
		
		.input-container button {
			padding: 8px 16px;
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 4px;
			cursor: pointer;
		}
		
		.input-container button:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		
		.input-container button:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		
		.model-info {
			font-size: 0.8em;
			color: var(--vscode-descriptionForeground);
			margin-top: 5px;
		}
	</style>
</head>
<body>
	<div class="chat-container">
		<div class="model-selector">
			<label for="modelSelect">Select Model:</label>
			<select id="modelSelect">
				<option value="">Loading models...</option>
			</select>
			<div class="model-info" id="modelInfo"></div>
		</div>
		
		<div class="chat-messages" id="chatMessages">
			<div class="message assistant-message">
				Welcome to the VS Code LLM Chat! Select a model above and start chatting.
			</div>
		</div>
		
		<div class="input-container">
			<input type="text" id="messageInput" placeholder="Type your message..." />
			<button id="sendButton">Send</button>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		let models = [];
		let selectedModel = null;
		let isThinking = false;

		const modelSelect = document.getElementById('modelSelect');
		const modelInfo = document.getElementById('modelInfo');
		const chatMessages = document.getElementById('chatMessages');
		const messageInput = document.getElementById('messageInput');
		const sendButton = document.getElementById('sendButton');

		// Handle messages from extension
		window.addEventListener('message', event => {
			const message = event.data;
			
			switch (message.command) {
				case 'modelsLoaded':
					loadModels(message.models, message.selectedModel);
					break;
				case 'modelSelected':
					selectedModel = message.model;
					updateModelInfo();
					break;
				case 'response':
					addMessage(message.message, 'assistant', message.model);
					setThinking(false);
					break;
				case 'error':
					addMessage(message.message, 'error');
					setThinking(false);
					break;
				case 'thinking':
					addMessage(message.message, 'thinking');
					setThinking(true);
					break;
			}
		});

		function loadModels(modelList, selected) {
			models = modelList;
			selectedModel = selected;
			
			modelSelect.innerHTML = '';
			
			if (models.length === 0) {
				modelSelect.innerHTML = '<option value="">No models available</option>';
				return;
			}
			
			models.forEach(model => {
				const option = document.createElement('option');
				option.value = JSON.stringify(model);
				option.textContent = \`\${model.name} (\${model.vendor})\`;
				if (selectedModel && model.id === selectedModel.id) {
					option.selected = true;
				}
				modelSelect.appendChild(option);
			});
			
			updateModelInfo();
		}

		function updateModelInfo() {
			if (selectedModel) {
				modelInfo.textContent = \`Family: \${selectedModel.family} | Max tokens: \${selectedModel.maxInputTokens || 'Unknown'}\`;
			} else {
				modelInfo.textContent = '';
			}
		}

		function addMessage(text, type, model) {
			const messageDiv = document.createElement('div');
			messageDiv.className = \`message \${type}-message\`;
			
			if (type === 'assistant' && model) {
				messageDiv.innerHTML = \`<strong>\${model.name}:</strong><br>\${text}\`;
			} else {
				messageDiv.textContent = text;
			}
			
			// Remove any existing thinking messages
			if (type !== 'thinking') {
				const thinkingMessages = chatMessages.querySelectorAll('.thinking-message');
				thinkingMessages.forEach(msg => msg.remove());
			}
			
			chatMessages.appendChild(messageDiv);
			chatMessages.scrollTop = chatMessages.scrollHeight;
		}

		function setThinking(thinking) {
			isThinking = thinking;
			sendButton.disabled = thinking;
			messageInput.disabled = thinking;
		}

		function sendMessage() {
			const text = messageInput.value.trim();
			if (!text || isThinking) return;
			
			if (!selectedModel) {
				addMessage('Please select a model first.', 'error');
				return;
			}
			
			addMessage(text, 'user');
			messageInput.value = '';
			
			vscode.postMessage({
				command: 'sendMessage',
				text: text
			});
		}

		// Event listeners
		sendButton.addEventListener('click', sendMessage);
		
		messageInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendMessage();
			}
		});

		modelSelect.addEventListener('change', (e) => {
			if (e.target.value) {
				const model = JSON.parse(e.target.value);
				vscode.postMessage({
					command: 'selectModel',
					model: model
				});
			}
		});

		// Initialize
		vscode.postMessage({ command: 'getModels' });
	</script>
</body>
</html>`;
	}
}
module.exports = {
	activate,
	deactivate
}
