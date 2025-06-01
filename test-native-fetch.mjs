// Simple test script for the VS LLM provider in ESM format
// Using native fetch (Node.js v18+)

const testVSLLM = async () => {
  try {
    console.log('Testing VS LLM provider...');
    
    // First, check if the VS LLM server is running
    console.log('1. Checking VS Code extension health...');
    const healthResponse = await fetch('http://localhost:3000/health');
    const health = await healthResponse.json();
    console.log(`   Server health: ${JSON.stringify(health)}`);
    
    // Get available models
    console.log('\n2. Fetching available models...');
    const modelsResponse = await fetch('http://localhost:3000/api/models');
    const models = await modelsResponse.json();
    console.log(`   Found ${models.count} models`);
    console.log(`   First model: ${models.models?.[0]?.name} (${models.models?.[0]?.vendor})`);
    
    // Test a simple chat completion
    console.log('\n3. Testing chat completion...');
    const testModel = models.models?.[0]?.id || 'gpt-3.5-turbo';
      const chatPayload = {
      messages: [{ content: 'Hello! What is VS Code in one sentence?' }]
    };
    
    const chatResponse = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload)
    });
    
    const chatResult = await chatResponse.json();
    console.log(`   Chat success: ${chatResult.success}`);
    console.log(`   Response: "${chatResult.response}"`);
    console.log(`   Model used: ${chatResult.model?.name}`);
    
    // Now test the bolt.diy API endpoint
    console.log('\n4. Testing bolt.diy API endpoint...');
    const boltPayload = {
      provider: { name: 'VS LLM' },
      model: testModel,
      message: 'Tell me a short joke about programming.',
      system: 'You are a helpful assistant.'
    };
    
    const boltResponse = await fetch('http://localhost:5176/api/llmcall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(boltPayload)
    });
    
    if (boltResponse.ok) {
      const boltResult = await boltResponse.json();
      console.log(`   Response successful!`);
      console.log(`   Content: "${boltResult.text}"`);
      console.log(`   Model: ${boltResult.model}`);
    } else {
      console.error(`   Error ${boltResponse.status}: ${await boltResponse.text()}`);
    }
    
  } catch (error) {
    console.error('Error testing VS LLM provider:', error);
  }
};

testVSLLM().then(() => console.log('Test completed!'));
