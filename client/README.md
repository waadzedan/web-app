# 🌱 BIO-BOT – Academic Assistant for Biotechnology Students

BIO-BOT is an intelligent academic assistant designed for **Biotechnology students**.  
The system provides **natural-language answers in Hebrew** about courses, prerequisites, registration guidelines, lab schedules, and academic contacts — powered by structured academic data and AI (Google Gemini).

---

## 🎯 Project Goals

- Provide a **single conversational interface** for academic information
- Reduce confusion around:
  - Course prerequisites and relations
  - Registration rules and registration windows
  - Lab schedules and responsibilities
- Support **free-text questions in Hebrew**
- Combine **rule-based logic** with **AI-based intent understanding**
- Ensure answers are **accurate, explainable, and data-driven**

---

## 🧠 What BIO-BOT Can Answer

### 📘 Courses
- Course name by code and vice versa  
- Prerequisites (קורסי קדם)
- Co-requisites (קורסים צמודים)
- Can course A be taken before / with course B

**Examples:**
- `מה השם של קורס 11456?`
- `אילו קורסי קדם יש לביוכימיה?`
- `אפשר ללמוד אלגוריתמים לפני מבני נתונים?`

---

### 🗓️ Registration Guidelines
Information is fetched from **Firestore – `registrationGuidelines` collection**.

The system supports **many natural formulations**, interpreted using Gemini intent classification.

Supported topics:
- Registration windows (dates & hours)
- How to register (process questions)
- Registration links and guides
- Credit requirements (נ״ז, 165)
- Academic advisors
- Exemptions / special approvals
- Who to contact and for what

**Examples:**
- `מתי חלון הרישום לסמסטר 3?`
- `איך נרשמים לסמסטר 1?`
- `יש קישור להדרכת רישום?`
- `כמה נ״ז צריך לתואר?`
- `למי פונים לגבי פטור?`

---

### 🧪 Labs
Lab-related questions are handled by a **dedicated route** to avoid conflicts with registration logic.

Supported information:
- Lab dates
- Lab times
- Lab groups
- Lecturers
- Lab schedule by semester

**Examples:**
- `מתי יש מעבדה בביולוגיה מולקולרית?`
- `מה השעה של המעבדה בסמסטר 2?`

---

### 💙 Emotional Support Detection
If a student expresses emotional or academic distress, the system responds **empathetically** and suggests appropriate academic support resources.

**Examples:**
- `אני בלחץ מהלימודים`
- `לא מצליחה להבין כלום`
- `אני מרגישה תקועה`

---

## 🏗️ System Architecture

### Backend
- **Node.js + Express**
- **Firestore (Firebase Admin SDK)**
- **Google Gemini API**
- Modular route-based architecture

### Key API Routes
- `/api/ask` – Main question answering endpoint  
- `/api/courses/suggest` – Course autocomplete  
- `/api/labs/*` – Lab-related queries  

### Data Sources (Firestore)
- `yearbooks/{id}/requiredCourses` – Courses & relations  
- `registrationGuidelines/semester_X` – Registration rules  
- `labs` – Lab schedules  

---

## 🧩 Technologies Used

- Node.js
- Express
- Firebase Firestore
- Google Gemini (Generative AI)
- REST API
- ES Modules

---

## 🔐 Environment Variables

Create a `.env` file inside the `server` directory:

```env
GEMINI_API_KEY=your_gemini_api_key
ADMIN_KEY=your_admin_key