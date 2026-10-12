export default async function handler(req, res) {
    let targetUrl = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
    
    if (!targetUrl) {
        return res.status(400).json({ error: "Missing url parameter" });
    }

    // الاعتماد كلياً على المتغيرات البيئية للحماية
    const activeToken = process.env.SCRAPE_DO_TOKEN_1 || process.env.SCRAPE_DO_TOKEN;
    
    if (!activeToken) {
        return res.status(500).json({ error: "API token is missing in Vercel environment variables" });
    }

    const scraperApiUrl = `http://api.scrape.do?token=${activeToken}&url=${encodeURIComponent(targetUrl)}&render=false`;

    try {
        const response = await fetch(scraperApiUrl);
        
        if (!response.ok) {
            return res.status(response.status).json({ error: "فشل الاتصال بخدمة الاستخراج" });
        }

        const html = await response.text();
        const regex = /\|(\d{7,9})\|(\d{10})\|([a-zA-Z0-9_]+)\|([a-zA-Z0-9_\-]+)\|/;
        const match = html.match(regex);

        if (match) {
            const id = match[1];
            const timestamp = match[2];
            const path = match[3];
            const token = match[4];

            const domain = new URL(targetUrl).origin;
            const rawM3u8 = `${domain}/stream/${token}/${path}/${timestamp}/${id}/master.m3u8`;

            return res.status(200).json({
                success: true,
                stream_url: rawM3u8,
                source: "regex_decoder"
            });
        } else {
            return res.status(404).json({ error: "لم يتم العثور على بيانات البث، ربما تغير نظام التشفير" });
        }

    } catch (error) {
        console.error("[shahid4u-extractor]", error);
        res.status(500).json({ error: "حدث خطأ داخلي أثناء الاستخراج" });
    }
}