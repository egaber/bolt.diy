# PowerShell script to test the VS Code LLM Bridge API

$API_BASE = "http://localhost:3000"

Write-Host "🧪 Testing VS Code LLM Bridge API" -ForegroundColor Cyan
Write-Host ""

function Test-Endpoint {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body = $null
    )
    
    try {
        $uri = "$API_BASE$Path"
        
        if ($Body) {
            $jsonBody = $Body | ConvertTo-Json -Depth 10
            $response = Invoke-RestMethod -Uri $uri -Method $Method -Body $jsonBody -ContentType "application/json"
        } else {
            $response = Invoke-RestMethod -Uri $uri -Method $Method
        }
        
        return @{ Success = $true; Data = $response }
    }
    catch {
        return @{ Success = $false; Error = $_.Exception.Message }
    }
}

# Test 1: Health check
Write-Host "1. Testing health endpoint..." -ForegroundColor Yellow
$health = Test-Endpoint -Method "GET" -Path "/health"
if ($health.Success) {
    Write-Host "   ✅ Status: OK" -ForegroundColor Green
    Write-Host "   📅 Timestamp: $($health.Data.timestamp)"
} else {
    Write-Host "   ❌ Error: $($health.Error)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Models
Write-Host "2. Testing models endpoint..." -ForegroundColor Yellow
$models = Test-Endpoint -Method "GET" -Path "/api/models"
if ($models.Success) {
    Write-Host "   ✅ Available models: $($models.Data.count)" -ForegroundColor Green
    if ($models.Data.models.Count -gt 0) {
        $firstModel = $models.Data.models[0]
        Write-Host "   🤖 First model: $($firstModel.name) ($($firstModel.vendor))"
    }
} else {
    Write-Host "   ❌ Error: $($models.Error)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Chat completion
Write-Host "3. Testing chat endpoint..." -ForegroundColor Yellow
$chatRequest = @{
    messages = @(
        @{ content = "Hello! Please respond with just 'API test successful' if you can read this." }
    )
}

$chat = Test-Endpoint -Method "POST" -Path "/api/chat" -Body $chatRequest
if ($chat.Success -and $chat.Data.success) {
    Write-Host "   ✅ Chat response received!" -ForegroundColor Green
    Write-Host "   💬 Response: $($chat.Data.response)"
    Write-Host "   🤖 Model: $($chat.Data.model.name)"
} else {
    if ($chat.Success) {
        Write-Host "   ❌ Chat API Error: $($chat.Data.error)" -ForegroundColor Red
    } else {
        Write-Host "   ❌ HTTP Error: $($chat.Error)" -ForegroundColor Red
    }
}
Write-Host ""

# Test 4: API Documentation
Write-Host "4. Testing docs endpoint..." -ForegroundColor Yellow
$docs = Test-Endpoint -Method "GET" -Path "/api/docs"
if ($docs.Success) {
    Write-Host "   ✅ Documentation available" -ForegroundColor Green
    Write-Host "   📚 API: $($docs.Data.name)"
    Write-Host "   🔗 Endpoints: $($docs.Data.endpoints.PSObject.Properties.Count)"
} else {
    Write-Host "   ❌ Error: $($docs.Error)" -ForegroundColor Red
}
Write-Host ""

Write-Host "🎉 API test completed!" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 If you see connection errors, make sure:" -ForegroundColor Gray
Write-Host "   1. The VS Code extension is running" -ForegroundColor Gray
Write-Host "   2. The LLM Bridge Server is started" -ForegroundColor Gray
Write-Host "   3. You have access to VS Code Language Models (e.g., GitHub Copilot)" -ForegroundColor Gray
