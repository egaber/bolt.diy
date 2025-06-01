const http = require('http');

const API_BASE = 'http://localhost:3000';

async function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const req = http.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(responseData);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: responseData });
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

async function testAPI() {
    console.log('🧪 Testing VS Code LLM Bridge API\n');

    try {
        // Test health endpoint
        console.log('1. Testing health endpoint...');
        const health = await makeRequest('GET', '/health');
        console.log(`   Status: ${health.status}`);
        console.log(`   Response:`, health.data);
        console.log();

        // Test models endpoint
        console.log('2. Testing models endpoint...');
        const models = await makeRequest('GET', '/api/models');
        console.log(`   Status: ${models.status}`);
        console.log(`   Available models: ${models.data.count || 0}`);
        if (models.data.models && models.data.models.length > 0) {
            console.log(`   First model: ${models.data.models[0].name} (${models.data.models[0].vendor})`);
        }
        console.log();

        // Test chat endpoint
        console.log('3. Testing chat endpoint...');
        const chatRequest = {
            messages: [
                { content: 'Hello! Please respond with just "API test successful" if you can read this.' }
            ]
        };

        const chat = await makeRequest('POST', '/api/chat', chatRequest);
        console.log(`   Status: ${chat.status}`);
        if (chat.data.success) {
            console.log(`   Response: ${chat.data.response}`);
            console.log(`   Model used: ${chat.data.model.name}`);
        } else {
            console.log(`   Error: ${chat.data.error}`);
        }
        console.log();

        // Test docs endpoint
        console.log('4. Testing docs endpoint...');
        const docs = await makeRequest('GET', '/api/docs');
        console.log(`   Status: ${docs.status}`);
        console.log(`   API name: ${docs.data.name}`);
        console.log(`   Available endpoints: ${Object.keys(docs.data.endpoints).length}`);
        console.log();

        console.log('✅ API test completed!');

    } catch (error) {
        console.error('❌ Error testing API:', error.message);
        console.log('\n💡 Make sure the VS Code extension is running and the server is started.');
    }
}

// Run the test
testAPI();
