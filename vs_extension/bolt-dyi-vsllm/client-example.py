#!/usr/bin/env python3
"""
Sample Python client for VS Code LLM Bridge API
This demonstrates how to call the LLM API from an external process.
"""

import requests
import json
import sys
from typing import Dict, Any, List, Optional

class VSCodeLLMClient:
    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url.rstrip('/')
        
    def health_check(self) -> Dict[str, Any]:
        """Check if the API server is running."""
        try:
            response = requests.get(f"{self.base_url}/health")
            response.raise_for_status()
            return {"success": True, "data": response.json()}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_models(self) -> Dict[str, Any]:
        """Get list of available language models."""
        try:
            response = requests.get(f"{self.base_url}/api/models")
            response.raise_for_status()
            return {"success": True, "data": response.json()}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def chat(self, messages: List[Dict[str, str]], model: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """Send a chat completion request."""
        try:
            payload = {"messages": messages}
            if model:
                payload["model"] = model
                
            response = requests.post(
                f"{self.base_url}/api/chat",
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            return {"success": True, "data": response.json()}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_docs(self) -> Dict[str, Any]:
        """Get API documentation."""
        try:
            response = requests.get(f"{self.base_url}/api/docs")
            response.raise_for_status()
            return {"success": True, "data": response.json()}
        except Exception as e:
            return {"success": False, "error": str(e)}

def main():
    print("🐍 Python VS Code LLM Bridge Client Test")
    print("=" * 50)
    
    client = VSCodeLLMClient()
    
    # Test 1: Health check
    print("1. Testing health endpoint...")
    health = client.health_check()
    if health["success"]:
        print(f"   ✅ Server is running")
        print(f"   📅 Timestamp: {health['data'].get('timestamp', 'N/A')}")
    else:
        print(f"   ❌ Error: {health['error']}")
        print("   💡 Make sure the VS Code extension is running!")
        return
    
    print()
    
    # Test 2: Get models
    print("2. Getting available models...")
    models = client.get_models()
    if models["success"]:
        model_data = models["data"]
        print(f"   ✅ Found {model_data.get('count', 0)} models")
        if model_data.get("models"):
            for i, model in enumerate(model_data["models"][:3]):  # Show first 3
                print(f"   🤖 Model {i+1}: {model.get('name', 'Unknown')} ({model.get('vendor', 'Unknown')})")
    else:
        print(f"   ❌ Error: {models['error']}")
    
    print()
    
    # Test 3: Chat completion
    print("3. Testing chat completion...")
    messages = [
        {"content": "Hello! Please tell me what VS Code is in one sentence."}
    ]
    
    chat_response = client.chat(messages)
    if chat_response["success"]:
        data = chat_response["data"]
        if data.get("success"):
            print(f"   ✅ Chat completed successfully!")
            print(f"   💬 Response: {data.get('response', 'No response')}")
            model_info = data.get('model', {})
            print(f"   🤖 Model used: {model_info.get('name', 'Unknown')}")
        else:
            print(f"   ❌ Chat API error: {data.get('error', 'Unknown error')}")
    else:
        print(f"   ❌ HTTP error: {chat_response['error']}")
    
    print()
    
    # Test 4: Interactive mode
    print("4. Interactive chat mode (type 'quit' to exit)...")
    while True:
        try:
            user_input = input("   You: ").strip()
            if user_input.lower() in ['quit', 'exit', 'q']:
                break
            
            if not user_input:
                continue
                
            messages = [{"content": user_input}]
            response = client.chat(messages)
            
            if response["success"] and response["data"].get("success"):
                llm_response = response["data"].get("response", "No response")
                print(f"   🤖 LLM: {llm_response}")
            else:
                error_msg = response["data"].get("error", response.get("error", "Unknown error"))
                print(f"   ❌ Error: {error_msg}")
                
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"   ❌ Unexpected error: {e}")
    
    print("\n🎉 Test completed!")

if __name__ == "__main__":
    main()
