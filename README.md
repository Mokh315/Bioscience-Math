# BioSense–Math PWA · تطبيق بايوسينس–ماث

تطبيق ويب قابل للتثبيت (PWA) ينفّذ المحرّك الرياضي لجهاز BioSense–Math: نموذج الإجهاد الخلوي
ذو الحيّزات الخمسة `(H, S, D, B, R)`. يعمل على الجوال واللوحي والحاسوب، ويعمل **دون إنترنت**،
وثنائي اللغة (عربي/إنجليزي) مع تبديل كامل RTL/LTR.

An installable, offline-first Progressive Web App implementing the mathematical engine of the
BioSense–Math device (five-compartment cellular-stress model). Bilingual Arabic/English with
full RTL/LTR mirroring.

---

## 1. النشر السريع — Netlify Drop (بدون حساب مطوّر، دقيقة واحدة)

1. افتح <https://app.netlify.com/drop>
2. اسحب **مجلد** `biosense-pwa` كاملاً (أو ملف `biosense-math-app.zip`) وأفلته في الصفحة.
3. ستحصل فوراً على رابط HTTPS مثل `https://random-name-123.netlify.app`.
4. افتح الرابط على الجوال ← قائمة المتصفح ← «إضافة إلى الشاشة الرئيسية».

> يمكنك إعادة تسمية الموقع من `Site settings → Change site name` للحصول على رابط أنيق
> مثل `https://biosense-math.netlify.app`.

## 2. النشر على GitHub Pages (رابط دائم مجاني)

```bash
# 1) أنشئ مستودعاً جديداً باسم biosense-math على github.com
# 2) من داخل مجلد التطبيق:
git init
git add .
git commit -m "BioSense-Math PWA"
git branch -M main
git remote add origin https://github.com/<اسم-المستخدم>/biosense-math.git
git push -u origin main
# 3) في GitHub: Settings → Pages → Source: main / (root) → Save
```

الرابط سيكون: `https://<اسم-المستخدم>.github.io/biosense-math/`

## 3. التجربة محلياً

```bash
python3 -m http.server 8000
# ثم افتح http://localhost:8000
```

`localhost` يُعدّ سياقاً آمناً، لذلك يعمل التثبيت والعمل دون إنترنت أثناء التجربة المحلية.
للتجربة من الجوال على نفس الشبكة استخدم عنوان IP للحاسوب، لكن التثبيت يتطلب HTTPS
(أي النشر عبر الخطوة 1 أو 2).

---

## التثبيت على الأجهزة — Installing

| الجهاز | الخطوات |
|---|---|
| **Android / Chrome** | افتح الرابط ← زر «تثبيت التطبيق» في الأعلى، أو ⋮ ← «تثبيت التطبيق / إضافة إلى الشاشة الرئيسية» |
| **iPhone / iPad (Safari)** | افتح الرابط ← زر المشاركة ⬆ ← «إضافة إلى الشاشة الرئيسية» |
| **Windows / macOS (Chrome, Edge)** | افتح الرابط ← أيقونة التثبيت ⊕ في شريط العنوان، أو ⋮ ← Install |
| **Linux (Chromium)** | ⋮ ← Install BioSense–Math |

بعد التثبيت يعمل التطبيق كتطبيق مستقل بنافذة خاصة، ويعمل كاملاً دون إنترنت.

---

## بنية الملفات — Project structure

```
index.html               الواجهة (ثلاث شاشات: محاكاة، لوحة قيادة، مرجع)
css/styles.css           التنسيق (فاتح/داكن، RTL/LTR، متجاوب)
js/model.js              النواة الرياضية: RHS، R₀، اليعقوبي، التوازنات، القيم الذاتية،
                         تكامل Dormand–Prince، عتبة هوبف، مؤشرات الإنذار المبكر،
                         تقدير المعاملات بالمربعات الصغرى التكاملية، تحويل الحسّاسات
js/charts.js             مكتبة رسم على canvas (بدون أي اعتماديات خارجية)
js/i18n.js               قاموس اللغتين
js/app.js                منطق التطبيق، الحالة، التصدير، التقارير، PWA
sw.js                    Service worker (عمل دون إنترنت)
manifest.webmanifest     بيان التطبيق (أيقونات، لقطات، اختصارات)
icons/ screenshots/      الأيقونات ولقطات الشاشة
tests/                   اختبارات وحدة (Node) واختبارات متصفح (Playwright)
```

## الاختبارات — Tests

```bash
node tests/test_model.js          # مطابقة النتائج مع مرجع Python/SciPy
python3 -m http.server 8199 &     # ثم:
node tests/e2e.js                 # اختبار متصفح كامل + التحقق من العمل دون إنترنت
```

## التحديث — Updating

عند تعديل أي ملف، غيّر رقم الإصدار في أول `sw.js`:

```js
const VERSION = 'bsm-v1.0.3';
```

سيقوم المتصفح بجلب النسخة الجديدة تلقائياً عند الفتح التالي.

## الخصوصية

كل الحسابات تجري داخل المتصفح. لا تُرسل أي قراءة أو بيان إلى أي خادم. سجلّ القراءات يُحفظ
محلياً في `localStorage` على جهازك فقط.

## المرجع العلمي

Mohammed El Mokhtar Ould El Mokhtar, *Global well-posedness, stability and Hopf bifurcation in
the BioSense–Math cellular-stress model, with an application to real-time biosensing*,
Department of Mathematics, College of Science, Qassim University.

النموذج:

```
H' = a·H·(1 − H/K) − β·B·H
S' = β·B·H − (γ + μ)·S + η·R
D' = μ·S − δ·D
B' = λ·D − θ·B
R' = σ·H − ρ·R          R₀ = β·K·μ·λ / [(γ + μ)·δ·θ]
```
