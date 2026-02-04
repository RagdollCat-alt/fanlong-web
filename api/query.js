export default async function handler(request, response) {
  // 1. 获取前端传来的 QQ 号
  const { qq } = request.query;

  // 2. 目标：华为云后端的原始 HTTP 地址
  const targetUrl = `http://116.205.101.141:8443/query?qq=${qq}`;

  try {
    // 3. Vercel 服务器帮我们去请求华为云
    const backendRes = await fetch(targetUrl, {
      headers: {
        // 核心补丁：伪造 Host 头，骗过备案拦截
        'Host': '116.205.101.141'
      }
    });

    // 4. 拿到数据
    const data = await backendRes.json();

    // 5. 返回给前端（Vercel 会自动处理 HTTPS 和跨域，不用操心）
    response.status(200).json(data);
    
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Backend Connection Failed' });
  }
}