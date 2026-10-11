# خطة: إضافة سيرفرات Beenar + إصلاح واجهة السيرفرات

## الخلاصة

- إضافة سيرفرات **Beenar** (Vidmoly / StreamWish / Sendvid) كسيرفرات تشغيل بديلة، للأفلام **والمسلسلات**، مدموجة مع كاشف kurdcinama القديم.
- فلترة حيّة لكل رابط قبل العرض: **السيرفر الموت ما يتزاد**.
- استبدال الشريط الصغير بشريط ثابت أسفل الشاشة، مكتوب عليه بالكردية «ڕاژەکارەکانی بینین»، يفتح لائحة مرقّمة مرتبة.
- VidCore يضل **رقم 1 دائماً** (الأساسي).

---

## نتائج الفحص الحقيقي (ما كتب هاد الحكي — مختبر)

### Beenar API — الطريقة المُستنتجَة

| Endpoint | الحقيقة |
|---|---|
| `GET /api/client/lists` | قائمة الأقسام (فیلم / زنجرە) — ما تحتاجها للتشغيل |
| `POST /api/client/search?page=1` بجسم `{q:"عنوان"}` | **يشتغل بلا تسجيل دخول**. يرجع `{data:{movie:{data:[{id,name}]},series:{data:[{id,name}]}}}` — صفوف البحث **ما فيهاش `release_date`** |
| `GET /api/client/title-show/{id}` | فيلم: يرجع `data.videos[]` + `data.release_date` + `data.is_series` |
| `GET /api/client/series-show/{id}?part={الموسم}` | مسلسل: يرجع `data.seasons[].episodes[].videos[]` (‏`part` = رقم الموسم) |
| `POST /api/client/find-movie-series` | **401 Unauthenticated** — ميزة الأعضاء فقط |

شكل عنصر الفيديو:
`{category:'full'|'trailer'|'download', quality:'1080p'|'hd'|null, url:'…', server:{id,name}|null}`
— `server` كثير ما يكون `null` (مثلاً في Interstellar)، فالمصدر للاسم هو الـ **host** ديال الرابط، والـ `server.name` احتياطية.
الروابط أحياناً بدون بروتوكول: `//vidmoly.net/embed-….html` ← لازم تحوّل إلى `https:`.

### فحص السيرفرات واحد واحد (مطلب «اللي مو شغال لا تضيف»)

| الرابط | النتيجة |
|---|---|
| `vidmoly.net/embed-…` | **301 → vidmoly.biz** — بعدها 200، `x-frame-options: ALLOWALL`، jwplayer + m3u8 → **كيشتغل ويقبل التضمين** ✅ |
| `embedwish.com/e/…` (StreamWish) | 200، jwplayer + m3u8، بلا X-Frame-Options → **كيشتغل** ✅ |
| `sendvid.com/embed/…` | 200 (21KB)، `X-Frame-Options: ALLOWALL`، videojs + mp4 → **كيشتغل** ✅ |
| `ronemo.com/embed/…` | 200 بس 114 بايت = `window.location.href="/lander"` → **ميت** ❌ |
| `playerwish.com/e/…` | 200 بس 426 بايت = «File is no longer available as it expired or has been deleted» → **الملف مات** ❌ |
| `vidfast.co` / `vidbem.com` / `fastplay.to` / `embed.mystream.to` | 200 ≈ 5.6KB كلهم = صفحة «Redirecting...» مكرّرة → **ميتين** ❌ |
| `anavids.com/embed/…` | **520** + `X-Frame-Options: SAMEORIGIN` → **ميت** ❌ |
| `beenar.uns.bio/#xxx` | shortlink lander مو embed → **مرفوض** ❌ |
| `drive.google.com/file/…/view?usp=sharing` | مو تضمين → **مرفوض** (الـ `/preview` فقط ممكن) |

### المصدر القديم kurdcinama

- `online.aspx?movieid=` (أمثلة حقيقية) لا يزال خدام: يرجع `<option>` لـ Stream wish / بێ ریکلام / vidmoly / voe.sx / File lions / Download / other. **أفلام فقط** (ما عنده season/episode).
- `online.aspx?movieid=1` (id فارغ) → 302 إلى `/error.html` — السكربت الحالي يتعامل معاه بـ «قائمة فارغة».

### ملاحظة IMDB (مهمة)

المنطق الحالي للموقع يستعمل **TMDB ID** (vidcore.io يقبله مباشرة)، وكاش TMDBCache **ما يرجعش imdb_id**.
‏Beenar **ما عندوش بحث عمومي بالـ IMDB** — مرجع IMDB الوحيد عندهم هو فورم طلب محتوى خاص بالأعضاء (`find-movie-series` → 401).
**الجسر الوحيد الممكن = بحث بالعنوان + مطابقة السنة** (وفيها `release_date` بعد جلب `title-show`).
إذن: `title` (+ `year` اختياري) ← بحث beenar ← أعلى 4 مرشحين بالاسم ← جلب التفاصيل بالتوازي ← اختيار الأقرب سنة + عنوان ← استخراج الفيديوهات.

---

## الملفات

| # | الملف | التغيير |
|---|---|---|
| 1 | `lib/servers.mjs` **(جديد)** | المنطق المشترك: بحث beenar، جلب التفاصيل، استخراج/تطبيع الروابط، الفلترة الحيّة، الترتيب، الدمج مع kurdcinama |
| 2 | `server.js` | يستورد `lib/servers.mjs`؛ يوسيع `action=servers` بـ `type/season/episode/year`؛ يمسح الكاش القديم للسكربت |
| 3 | `api/proxy.js` | نفس الوظيفة (Vercel) — يستورد نفس الوحدة بدل تكرار الكود |
| 4 | `public/js/api.js` | `getServers()` يوسيع، وتحديث توثيق الهيدر (شرط `check.js`) |
| 5 | `public/js/router.js` | قراءة `year` من الـ query في مسار `watch` |
| 6 | `public/js/pages/details.js` | يمرّر `year` داخل `watchHref()` |
| 7 | `public/js/pages/watch.js` | شريط سفلي + لائحة، دعم المسلسلات، تحديث السيرفرات عند تبديل الحلقة |
| 8 | `public/css/components.css` | أنماط `.server-bar` / `.server-sheet` / `.server-row` + حذف أنماط الشريط القديم |
| 9 | `public/js/localization.js` | إضافة النصوص الكردية/الإنجليزية للنصوص الجديدة |
| 10 | `scripts/check.js` | إضافة `lib/servers.mjs` إلى قائمة الاستثناء في قاعدة «fetch() في api.js فقط» |
| 11 | `README.md` | توثيق السلوك الجديد (المشروع متعوّد على توثيق كل تغيير) |

---

## التنفيذ

### 1) `lib/servers.mjs` — العقل الجديد

```js
export async function collectServers({ type, title, year, season, episode, tmdbid, movieid })
  -> { servers: [{key,label,url,host,quality,source}], sources: {beenar:n,kurdcinama:n}, cached }
```

- **مطابقة العنوان**: `normalize()` = lowercase + حذف `(YYYY)` + حذف علامات الترقيم + ضغط المسافات. درجة: تطابق تام = 2، يبدأ/يحتوي = 1. أعلى **4** مرشحين فقط (حدّ أقصى لطلبات التفاصيل).
- **جلب التفاصيل بالتوازي** (`Promise.allSettled`)، ثم اختيار المرشح: نفس السنة بالضبط ← ±1 سنة ← بلا اعتبار للسنة. نخزّل `titleIdCache` (نوع+عنوان ← beenar id) لمدة 24 ساعة حتى ما نعاودش البحث.
- **استخراج**:
  - فيلم (`title-show`): `data.videos`
  - مسلسل (`series-show?part=season`): الموسم اللي `number === season` ← الحلقة `episode_number === episode` ← `videos`
  - تُرفض `category` غير `full` (‏trailer/download) — التحميل خارج نطاق اللائحة.
- **تطبيع**: `//host/...` → `https://host/...`، رفض أي رابط ماشي http(s)، اسم السيرفر = `server.name` أو `host`، الجودة = `quality || ''`.
- **فلترة حيّة** (هاد اللي كيحقق «افحص Server اللي مو شغال لا تضيف»):
  - رفض سلف: `beenar.uns.bio`، روابط فيها `#/` فقط، `drive.google.com` إلا `/preview`، `?search=` (europixhd).
  - فحص متوازِي `GET` بـ User-Agent متصفح، `AbortSignal.timeout(4000)` لكل رابط، بَجمة 8 ث، حدّ أقصى 12 رابط.
  - القبول: الحالة 200 + طول ≥ 3000 بايت + وجود بصمة مشغّل (`jwplayer|videojs|video-js|plyr|file\s*:|sources|m3u8|\.mp4|playlist|<video|<iframe`) + عدم وجود بصمة موت (`File is no longer available|has been deleted|/lander`).
  - النتيجة مخزّنة 30 دقيقة لكل (نوع، id، موسم، حلقة).
- **الدمج**: كشف kurdcinama (السكربت الحالي، أفلام فقط) يمرّ بنفس فلترة الفحص، ثم الدمج مع beenar مع إزالة التكرار حسب الرابط النهائي.
- **الترتيب** («مرتب»): `vidmoly` ← `streamwish/embedwish/playerwish` ← `sendvid` ← `beenar` ← الباقي أبجدياً؛ داخل نفس المضيف يبقى ترتيب المصدر (beenar ثم kurdcinama). حدّ أقصى **8** سيرفرات حتى تبقى اللائحة مقروءة.
- **UAs والـ retry**: طلب واحد لإعادة المحاولة عند `reset/timeout` (نفس نمط `server.js` الحالي) — ‏Beenar ورا Sucuri يحجب بلا UA متصفح.

### 2) `server.js` / `api/proxy.js` — وبيئة Vercel

- توسيع معالج `action=servers`: قراءة `type` (`movie`|`tv`، افتراضي `movie`)، `season`، `episode`، `year`، مع الإبقاء على `movieid`/`title`/`tmdbid`.
- الحالة القديمة تبقى: بلا أي معرّف ← 400؛ العنوان غير موجود ← **200 بقائمة فارغة** (المشغّل الأساسي يبقى وحده).
- كاش 30 دقيقة + `stale-while-revalidate` مثل الحالي، و`X-Cache` للتشخيص.
- حذف دوال السكربت القديمة (`extractHiddenInputs` / `scrapeKurdishServersForMovie` / `findMovieIdBy*`) من `server.js` و`api/proxy.js` بعد نقلها إلى `lib/servers.mjs`.

**بيئة Vercel (الموقع الحيّ حسب اللوقز: `hwto-kurd.vercel.app`):**

- `api/proxy.js` هو الخادم الحيّ اليوم، و`server.js` للتطوير المحلي — لذلك `lib/servers.mjs` **مشتركة بالضبط** بين الاثنين بلا تكرار، حتى يبقى السلوك متطابقاً.
- **المهلة آمنة بلا تعديل `vercel.json`**: مع Fluid compute حدّ Vercel الأقصى 300 ث (Hobby وPro) ومهلة البروكسي 120 ث — بَجمة الـ 20 ث وفحوصات ~8 ث كدخل داخلها.
- **كاش الحافة يحيد غلاء الفحص**: معالج `servers` يرجع أصلاً `s-maxage=180, stale-while-revalidate=60` ← التكرار خلال 3 دقائق ما بيدفعش تكلفة الفحص.
- **الكاش داخل الذاكرة** (`titleIdCache` + كاش نتيجة الفحص) **مكسب إضافي وليس شرطاً**: كل استدعاء Vercel قد يكون instance جديد. لا نعتمد عليه — كاش الحافة هو الصحيح.
- **تحذير `url.parse()` (DEP0169) في اللوق**: جاي من رانتايم Vercel نفسه (عملية `node:6`)؛ كودنا كامل كيستعمل WHATWG `new URL()` ← **ما كاين حتى تعديل في الريبو بسببه**.
- **تصحيح README**: الجملة القائلة إن «كشف السيرفرات متوقف على Vercel وVidCore وحده» **قديمة** — `api/proxy.js` كينفّذ الكشف فعلاً. تُصحَّح عند التوثيق.
- مجلد `lib/` ما كيتسرڤش كملف عام: الـ rewrite `/(.*)` → `/public/$1` يعني `/lib/...` يرجع 404 — بلا تسريب للمصدر.

### 3) الواجهة — الشريط السفلي (استبدال الشريط القديم)

في `watch.js`، الشريط القديم `#server-strip` **يُستبدل** بـ:

```html
<div class="server-bar" id="server-bar" hidden>
  <button type="button" class="server-bar-toggle" id="server-bar-toggle"
          aria-expanded="false" aria-controls="server-sheet">
    <span class="server-bar-count" id="server-bar-count">0</span>
    <span class="server-bar-label">سيرفرات التشغيل</span>   <!-- ← «ڕاژەکارەکانی بینین» بالكردية -->
  </button>
</div>
<div class="server-sheet-backdrop" id="server-sheet-backdrop" hidden></div>
<div class="server-sheet" id="server-sheet" role="dialog" aria-modal="true"
     aria-labelledby="server-sheet-title" hidden>
  <div class="server-sheet-head">
    <h3 id="server-sheet-title">سيرفرات التشغيل</h3>
    <button class="btn-close-box" type="button" id="server-sheet-close" aria-label="إغلاق">✕</button>
  </div>
  <ul class="server-rows" id="server-rows"></ul>
</div>
```

- الشريط **ثابت أسفل الشاشة** (`position: fixed; bottom: 0` + `env(safe-area-inset-bottom)`)، و`.watch-page` ياخذ `padding-bottom` حتى ما يغطيش المحتوى.
- الضغط على الشريط يفتح اللائحة (slide-up)، الضغط على الخلفية / `✕` / `Escape` يغلقها، والتركيز يرجع للشريط.
- اللائحة مرقّمة `1..N`:
  - `1` = **VidCore** مع شارة «الأساسي» (TMDB) — دائماً أول.
  - بعده السيرفرات المرتّبة حسب القاعدة فوق، كل سطر: رقم + اسم السيرفر + الجودة.
  - النشط عليه `.is-active` + علامة ✓؛ الضغط يبدّل `iframe.src` ويحدّث `#stream-url-input` ويغلق اللائحة.
- البار واللائحة ما يظهرانش إلا إذا كان ≥1 سيرفر بديل (مثل سلوك الشريط الحالي).
- **المسلسلات**: `wireAlternateServers` ما عادت ترجع مبكرًا لـ `tv`؛ تُستدعى عند الفتح **وعند كل تبديل موسم/حلقة** (`switchEpisode` + `onRoute`) مع `AbortController` ورقم طلب حتى ما تخلطش الأجابة القديمة بالجديدة. اختيار المستخدم للسيرفر يبقى (نفس المضيف) إذا توفر في الحلقة الجديدة، وإلا يرجع VidCore.
- إضافة `year` إلى رابط المشاهدة من `details.js` حتى تكون مطابقة Beenar دقيقة.

### 4) CSS + التوطين

- أنماط جديدة في `components.css` على نمط المتغيّرات الحالية (`--surface-2`, `--line`, `--brand`, `--radius-lg`)، وحذف `.server-strip` / `.server-list` / `.server-pill` القديمة.
- إضافة في `localization.js` (المفتاح = النص العربي في الـ markup):
  `سيرفرات التشغيل` → ckb `ڕاژەکارەکانی بینین` / en `Playback servers`،
  `الأساسي` → `سەرەکی` / `Primary`،
  `لا توجد سيرفرات بديلة` → `هیچ ڕاژەکارێکی جێگرەوە نییە` / `No alternate servers`.

### 5) التوثيق

- `api.js` header: تحديث سطر `?action=servers` بالمعاملات الجديدة وشكل الإجابة.
- `README.md`: قسم «المشاهدة والمصادر» يوثّق Beenar، الفحص الحي، والشريط السفلي.

---

## التحقق

1. `npm run check` — لازم يمرّ بلا أخطاء (صياغة، حل الـ imports، طبقة الـ fetch، تصديرات `api.*`، توثيق الأكشن).
2. `node scripts/check.js --smoke` — إقفال الخادم واختبار الـ proxy فعلياً.
3. `node server.js` ثم اختبار curl حقيقي:
   - `curl 'http://127.0.0.1:4173/api/TMDBCache.aspx?action=servers&title=Dune&type=movie&year=2021'`
   - `curl 'http://127.0.0.1:4173/api/TMDBCache.aspx?action=servers&title=Game%20of%20Thrones&type=tv&season=1&episode=1'`
   - التأكد أن كل رابط مرجوع يرجع 200 عند فحصه مرة ثانية، وأن ronemo/playerwish/vidfast **غائبين**.
4. فحص يدوي في المتصفح: `#/watch/movie/438631?title=Dune` و`#/watch/tv/1399?title=Game%20of%20Thrones&season=1&episode=1` — الشريط السفلي ظاهر بالكردية، اللائحة مرقّمة، التبديل يبدّل المشغّل، تبديل الحلقة يحدّث اللائحة.
5. **مسار Vercel**: نفس أمرين curl يُطلَبان على `https://hwto-kurd.vercel.app/api/TMDBCache.aspx?...` **بعد نشرك أنت** (أنا ما ننشرش بلا إذنك) — للتأكد أن `api/proxy.js` راجع نفس الشكل.
6. `npm run qa` — **غير ممكن هنا**: ما فيه `node_modules` ولا `playwright-core` ولا Chromium. إن أردتَ تشغيله لاحقاً: `npm i -D playwright-core` + `CHROMIUM=/path/to/chrome npm run qa`.

## المخاطر

- **Sucuri WAF** على beenar يحجب بلا UA متصفح (مختبر: طلبات بلا UA رجعت connection reset). الحل: UA متصفح + إعادة محاولة واحدة + كاش الحافة 180 ث.
- **روابط تتقتل مع الوقت** (playerwish مثلاً). الحل: الفحص الحي عند الطلب بدل قائمة ثابتة.
- **ثقل الفحص**: بَجمة 8 ث + 12 رابط كحدّ أقصى بالتوازي — الشاشة ما تتوقفش، والسيرفرات الاختيارية أصلاً: الفشل = VidCore يضل وحده.
- **Vercel**: `lib/servers.mjs` خارج `api/` بس الـ bundler كيجمع الـ imports عادي؛ ما كاين حتى مفتاح API؛ حدّ المهلة 300 ث يكفي بمراحل.
- **LCP/الاستجابة**: `action=servers` يبقى غير حرج (الواجهة كتنده عليه بعد الرسم، والمشغّل الأساسي ما كيستناهش).
