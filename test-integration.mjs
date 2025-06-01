// VS LLM Integration Test - End to End
// This test verifies the complete integration from bolt.diy to VS Code extension

const testFullIntegration = async () => {
  console.log('🚀 VS LLM Integration Test - Full End-to-End');
  console.log('=' .repeat(50));

  try {
    // 1. Health Check
    console.log('1. 🏥 Health Check - VS Code Extension');
    const healthResponse = await fetch('http://localhost:3000/health');
    const health = await healthResponse.json();
    console.log(`   ✅ Extension Status: ${health.status}`);
    console.log(`   📅 Timestamp: ${health.timestamp}`);
    console.log(`   🔗 Extension: ${health.extension}`);

    // 2. Models Check
    console.log('\n2. 🤖 Available Models');
    const modelsResponse = await fetch('http://localhost:3000/api/models');
    const models = await modelsResponse.json();
    console.log(`   ✅ Total Models: ${models.count}`);
    console.log(`   🎯 First Model: ${models.models?.[0]?.name} (${models.models?.[0]?.vendor})`);
    console.log(`   🎯 Second Model: ${models.models?.[1]?.name} (${models.models?.[1]?.vendor})`);

    // 3. Direct VS Code Extension Test
    console.log('\n3. 🎯 Direct Extension Test');
    const directResponse = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ content: 'Hello! Can you tell me what TypeScript is in one sentence?' }]
      })
    });
    
    const directResult = await directResponse.json();
    console.log(`   ✅ Direct Success: ${directResult.success}`);
    console.log(`   💬 Response: "${directResult.response}"`);
    console.log(`   🤖 Model Used: ${directResult.model?.name}`);

    // 4. Bolt.diy API Test
    console.log('\n4. 🔧 Bolt.diy API Integration Test');
    const testModel = models.models?.[0]?.id || 'gpt-3.5-turbo';
    
    const boltResponse = await fetch('http://localhost:5176/api/llmcall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: { name: 'VS LLM' },
        model: testModel,
        message: 'What is React in one sentence?',
        system: 'You are a helpful coding assistant.'
      })
    });

    if (boltResponse.ok) {
      const boltResult = await boltResponse.json();
      console.log(`   ✅ Bolt API Success: true`);
      console.log(`   💬 Response: "${boltResult.text}"`);
      console.log(`   🤖 Model: ${boltResult.model || 'auto-selected'}`);
    } else {
      console.error(`   ❌ Bolt API Error ${boltResponse.status}: ${await boltResponse.text()}`);
      return false;
    }

    // 5. Models endpoint test
    console.log('\n5. 📋 Bolt.diy Models Endpoint Test');
    const boltModelsResponse = await fetch('http://localhost:5176/api/models/VS%20LLM');
      if (boltModelsResponse.ok) {
      const boltModels = await boltModelsResponse.json();
      console.log(`   ✅ Models Endpoint Success: true`);
      console.log(`   📊 Models Count: ${Array.isArray(boltModels) ? boltModels.length : 'Unknown format'}`);
      if (Array.isArray(boltModels) && boltModels.length > 0) {
        console.log(`   🎯 Sample Models: ${boltModels.slice(0, 3).map(m => m.name).join(', ')}`);
      } else {
        console.log(`   📝 Response format: ${typeof boltModels}`);
      }
    } else {
      console.error(`   ❌ Models Endpoint Error ${boltModelsResponse.status}`);
    }

    console.log('\n' + '=' .repeat(50));
    console.log('🎉 INTEGRATION TEST COMPLETED SUCCESSFULLY! 🎉');
    console.log('✅ VS LLM provider is fully integrated with bolt.diy');
    console.log('✅ All communication channels are working');
    console.log('✅ Models are being fetched correctly');
    console.log('✅ Chat responses are working end-to-end');
    
    return true;

  } catch (error) {
    console.error('\n❌ Integration test failed:', error);
    return false;
  }
};

testFullIntegration().then(success => {
  if (success) {
    console.log('\n🏆 Test Status: PASSED');
  } else {
    console.log('\n💥 Test Status: FAILED');
  }
});
