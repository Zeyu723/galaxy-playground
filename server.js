import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// 加载环境变量
dotenv.config();

const app = express();

// 增加请求体大小限制，防止长提示词报错
app.use(express.json({ limit: '1mb' }));

// 允许跨域请求 (允许前端从 localhost:5500 或 127.0.0.1:5500 访问)
app.use(cors());

// 从环境变量获取 API Key
const API_KEY = process.env.GEMINI_API_KEY;
const PORT = process.env.PORT || 3000;

if (!API_KEY) {
  console.warn('⚠️ 警告: .env 文件中未找到 GEMINI_API_KEY，AI 功能将无法工作。');
}

// 定义生成接口
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`收到生成请求: "${prompt.substring(0, 50)}..."`);

    // 1. System Prompt: 明确指示只生成循环体代码
    const systemPrompt = `
      You are an expert Three.js creative coder. 
      Task: Write the JavaScript code INSIDE a for-loop to set particle coordinates.
      
      Context:
      - Loop variable: 'i' (0 to particleCount)
      - Output array: 'targetPositions' (Float32Array). Center is 0,0,0.
      - Optional Output: 'targetColors' (Float32Array, r/g/b 0-1).
      - Math helpers available: sin, cos, tan, PI, random, sqrt, pow, abs.
      
      Constraints:
      - Write ONLY the code lines inside the loop. 
      - Do NOT write the 'for' loop statement itself.
      - Do NOT wrap in markdown code blocks.
      - Scale roughly -50 to 50.
    `;
    
    // 2. 构造请求体
    const requestBody = {
      contents: [{ 
        parts: [{ 
          text: `Create a 3D particle shape description: "${prompt}". Return valid JS code body only.` 
        }] 
      }],
      systemInstruction: { 
        parts: [{ text: systemPrompt }] 
      },
      generationConfig: {
        temperature: 1.1, 
        maxOutputTokens: 2000
      }
    };

    // 3. 调用 Gemini API
    // ▼▼▼▼▼▼ 修改点：切换回 gemini-2.0-flash ▼▼▼▼▼▼
    // 如果这个版本也报错，可以尝试 'gemini-2.0-flash-exp' 或 'gemini-1.5-pro'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    const data = await response.json();

    // 处理 API 错误
    if (!response.ok) {
      console.error('Gemini API Error:', JSON.stringify(data, null, 2));
      // 返回具体的错误信息给前端
      return res.status(500).json({ error: data.error?.message || 'API Error' });
    }

    // 4. 提取并清理代码
    let code = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // 移除 markdown 标记 (```javascript ... ```)
    code = code.replace(/```javascript/gi, '').replace(/```js/gi, '').replace(/```/g, '').trim();
    
    // 移除可能存在的 "for (let i..." 开头
    if (code.startsWith('for')) {
        const match = code.match(/\{([\s\S]*)\}/);
        if (match && match[1]) {
            code = match[1].trim();
        }
    }

    console.log("生成成功，代码长度:", code.length);

    // 5. 返回给前端
    res.json({ code });

  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});