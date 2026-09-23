const { extractPinterest } = require('../src/extractors/pinterest');

async function testPin(url) {
  console.log('\nTesting extraction for:', url);
  try {
    const result = await extractPinterest(url);
    console.log('Extraction successful!');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Extraction failed:', error.message);
  }
}

async function main() {
  // 1. The short link video pin
  await testPin('https://pin.it/ZzvVviSUb');

  // 2. An image pin (usually standard pin page with no video)
  // Let's use a known pin ID
  await testPin('https://www.pinterest.com/pin/1013732197364177727/');
}

main();
