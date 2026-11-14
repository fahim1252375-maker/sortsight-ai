# SortSight AI — শুরু করার নির্দেশিকা (বাংলা)

এই ফাইলটি নতুন করে project চালু করার জন্য। প্রথমবার চালানোর আগে Node.js 22 বা তার পরের LTS সংস্করণ ব্যবহার করুন।

## ১. প্রয়োজনীয় সফটওয়্যার

- Node.js 22+
- npm (Node.js-এর সঙ্গে আসে)
- macOS / Windows / Linux

Terminal খুলে যাচাই করুন:

```bash
node -v
npm -v
```

## ২. Dependency ইনস্টল

ZIP extract করে `sortsight-ai` project folder-এ Terminal খুলুন। তারপর চালান:

```bash
npm install --no-audit --no-fund
```

প্রথমবার install করতে internet connection প্রয়োজন। `EAI_AGAIN` বা registry/network error এলে internet/DNS ঠিক করে command আবার চালান।

## ৩. Environment file তৈরি

```bash
cp .env.example .env
```

Local development-এ app unset secret-এর জন্য temporary key তৈরি করতে পারে। তবে restart-এর পর session ও encrypted integration secret ঠিক রাখতে `.env`-এ নিজস্ব স্থায়ী random key বসান। Terminal-এ দুইবার নিচের command চালিয়ে প্রতিবারের output আলাদা করে কপি করুন:

```bash
openssl rand -hex 32
```

প্রথম output `JWT_SECRET=`-এর পরে এবং দ্বিতীয় output `ENCRYPTION_KEY=`-এর পরে বসান। `ENCRYPTION_KEY` অবশ্যই ৬৪টি hexadecimal character হতে হবে। `.env` কখনো GitHub-এ upload করবেন না।

Google Gemini ব্যবহার করতে চাইলে `GEMINI_API_KEY`-এ server-side API key দিন। Frontend source code-এ API key রাখবেন না। এটি optional; key না থাকলে project-এর offline fallback ব্যবহার করা হয়।

## ৪. Project চালু

```bash
npm run dev
```

Browser-এ খুলুন:

```text
http://localhost:3000
```

প্রথমবার চালু হলে SQLite database তৈরি হবে এবং migration নিজে থেকে run হবে। Development mode-এ sample/demo data seed হয়।

## ৫. Demo login (শুধু Development / QA)

সব demo account-এর password:

```text
SortSightDemo2026!
```

Admin: `admin@sortsight.demo`  
Facility Manager: `manager@sortsight.demo`  
Operator: `operator@sortsight.demo`  
Reviewer: `reviewer@sortsight.demo`  
Analyst: `analyst@sortsight.demo`

এই demo account production-এ defaultভাবে তৈরি হয় না। নিজের production admin account registration করে তৈরি করুন।

## ৬. Verification commands

```bash
npm run lint
npm test
npm run build
```

- `lint`: TypeScript check
- `test`: automated Vitest suite
- `build`: TypeScript check এবং production frontend bundle

কোনো command fail করলে Terminal-এর প্রথম error message সংরক্ষণ করুন; একসঙ্গে অনেক dependency version পরিবর্তন করবেন না।

## ৭. Production deployment

Production-এ `NODE_ENV=production`, স্থায়ী `JWT_SECRET`, ৬৪-character `ENCRYPTION_KEY`, এবং সঠিক `APP_URL` বাধ্যতামূলক। `SEED_DEMO_DATA=false` রাখুন। Production setup ও Docker Compose-এর পূর্ণ নির্দেশনা `docs/DEPLOYMENT.md`-এ আছে।

Docker ব্যবহার করলে:

```bash
docker compose up --build -d
docker compose logs -f sortsight-web
```

SQLite database named Docker volume-এ থাকে। JWT ও encryption key নিরাপদে backup রাখুন এবং পরিবর্তন করলে encrypted integration secret-এর প্রভাব বিবেচনা করুন।

## ৮. 3D ও Camera

3D scene-এর জন্য WebGL-enabled, updated browser ও graphics acceleration দরকার হতে পারে। কোনো device WebGL support না করলে 3D scene-এর fallback UI দেখানোর ব্যবস্থা আছে। Camera feature ব্যবহার করলে browser permission চাইবে; camera permission না দিলে image upload workflow ব্যবহার করুন।

## গুরুত্বপূর্ণ

- AI visual inspection রাসায়নিক নিরাপত্তা যাচাই করে না। Hazardous waste-এর ক্ষেত্রে human safety review প্রয়োজন।
- Conveyor, robot, PLC ও industrial camera integration hardware সংযুক্ত ও যাচাই করা না থাকলে simulator হিসেবেই গণ্য হবে।
- Demo/sample recycling policy-কে official legal regulation ধরে ব্যবহার করবেন না।
