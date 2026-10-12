export default async function handler(req, res) {
    let targetUrl = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
    
    if (!targetUrl) {
        return res.status(400).json({ error: "Missing url parameter" });
    }

    try {
        // جلب صفحة المشغل مباشرة بنفس عنوان IP الخادم لتفادي قفل الـ IP
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://shaheid4u.name/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: `فشل جلب صفحة المشغل (${response.status})` });
        }

        const html = await response.text();

        // استخراج أجزاء البث الأربعة: ID، الوقت، المسار، التوكن
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