export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const systemPrompt = "You are an expert Three.js creative coder. Task: write ONLY the JavaScript code INSIDE a for-loop to set particle coordinates. Loop variable: i (0..particleCount). Output: targetPositions (Float32Array). Optional: targetColors (Float32Array, r/g/b 0..1). Use helpers: sin, cos, tan, PI, random, sqrt, pow, abs. Do NOT wrap in markdown. Scale roughly -50..50.";
    
    const requestBody = {
      contents: [{ parts: [{ text: `Create a 3D particle shape description: "${prompt}". Return valid JS code body only.` }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 1.1, maxOutputTokens: 2000 }
    };

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'Server API key not configured' });

    // ▼▼▼▼▼▼ 核心修改：必须使用 v1beta 才能支持 systemInstruction ▼▼▼▼▼▼
    const MODEL = 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
    const data = await r.json();
    
    if (!r.ok) {
        console.error('API Error:', data); // 添加日志方便调试
        return res.status(500).json({ error: data?.error?.message || 'API Error' });
    }
    
    let code = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    code = code.replace(/```javascript/gi, '').replace(/```js/gi, '').replace(/```/g, '').trim();
    if (code.startsWith('for')) { const m = code.match(/\{([\s\S]*)\}/); if (m && m[1]) code = m[1].trim(); }
    
    return res.status(200).json({ code });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: '服务器内部错误' });
  }
}