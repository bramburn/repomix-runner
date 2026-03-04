#!/usr/bin/env ts-node
import OpenAI from 'openai';
/**
 * Simple test to verify local LLM connection
 */

async function main() {
  console.log('Testing LLM connection to 192.168.0.136:8080/v1\n');

  try {
    // Dynamic import for OpenAI SDK (CommonJS module)
    

    const client = new OpenAI({
      apiKey: 'not-needed',
      baseURL: 'http://192.168.0.136:8080/v1',
    });

    console.log('Sending test request to Qwen3.5-9B...');
    
    const response = await client.chat.completions.create({
      model: 'qwen3.5-9b',
      messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
      temperature: 0.3,
      max_tokens: 50,
    });

    const result = response.choices[0]?.message?.content || '';

    console.log('SUCCESS! Response:');
    console.log('  "' + result.trim() + '"');
    console.log('\nLLM connection is working.');
    process.exit(0);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log('FAIL: ' + errMsg);
    process.exit(1);
  }
}

main();
