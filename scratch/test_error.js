
async function testQuery() {
    try {
        const response = await fetch('http://localhost:3000/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'Hola, que es Plastitec?', conversationId: 'test' })
        });
        
        console.log('Status:', response.status);
        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Fetch error:', error.message);
    }
}

testQuery();
