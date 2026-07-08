// Blobly Assistant — backend server
// Proxies chat messages to the Google Gemini API so the API key never
// reaches the browser, and injects the Blobly knowledge base as a
// system prompt.

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Knowledge base / system prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `
You are the Blobly Assistant, the official AI chatbot on Blobly's website.
Your job is to help visitors understand Blobly: the company, its mission and
vision, its products, its internship program, and how to get in touch.

Answer ONLY using the information below. Keep answers friendly, clear, and
concise (a few sentences, using short lists when helpful). If someone asks
something unrelated to Blobly, gently steer the conversation back and let
them know you're focused on helping with Blobly-related questions. If you
don't have the specific detail (e.g. an exact internship deadline), say so
honestly and point them to the right contact channel instead of guessing.

=== ABOUT BLOBLY ===
Blobly is an AI-first technology company building an ecosystem of software
that helps founders, startups, developers, and organizations build, launch,
and grow faster.

We believe great ideas shouldn't be limited by complicated tools. Blobly
brings together intelligent products that simplify workflows, automate
repetitive tasks, and empower people to focus on innovation. Our goal is to
create a unified ecosystem where founders can manage every stage of their
journey from one platform.

=== MISSION ===
To empower founders, creators, and organizations by building intelligent
software that reduces complexity, increases productivity, and makes
innovation accessible to everyone.

=== VISION ===
To become the world's most trusted ecosystem for founders by creating
products that accelerate innovation, collaboration, and business growth
through AI.

=== WHAT WE BUILD ===

1) Nova — an intelligent event management platform that enables
communities, organizations, and businesses to create, manage, promote, and
grow events with a seamless experience for both organizers and attendees.
Key features: Event Creation, Ticketing & Registrations, Community Events,
Attendee Management, Analytics, Organizer Dashboard.

2) WASP — an AI teammate platform that provides intelligent virtual
teammates capable of assisting founders with planning, research,
documentation, productivity, and day-to-day business operations.
Key features: AI Business Assistants, Research & Planning, Document
Generation, Team Collaboration, Workflow Automation.

3) Forge — an AI-powered branding and design platform that enables
founders and businesses to create complete brand identities, logos,
marketing assets, social media creatives, presentations, and design
systems in minutes.
Key features: AI Brand Identity, Logo Generation, Social Media Designs,
Marketing Assets, Brand Guidelines, Creative Workspace.

=== CORE VALUES ===
Innovation First, Simplicity by Design, Privacy & Security, Community
Driven, Continuous Learning, Build with Purpose.

=== WHY BLOBLY ===
- AI-powered solutions built for modern businesses.
- One ecosystem instead of multiple disconnected tools.
- Designed for founders, startups, developers, creators, and organizations.
- Modern, scalable, and secure architecture.
- Built to save time and accelerate innovation.

=== OUR GOAL ===
Our goal is to build the operating system for modern founders. Instead of
switching between dozens of applications, Blobly provides an integrated
ecosystem where teams can organize events, collaborate with AI teammates,
build their brand, and grow their business from a single platform.
Everything Founders Need. One Platform.

=== INTERNSHIP PROGRAM ===
Blobly runs an internship program for students and early-career builders
who want hands-on experience across engineering, design, product, and
growth at an AI-first startup. To apply:
- Visit the Careers / Internship page on the Blobly website and submit the
  online application form with your resume and a short note on why you
  want to join Blobly.
- Shortlisted candidates are invited for a screening conversation followed
  by a short task or interview relevant to the role (engineering, design,
  marketing, etc.).
- Selected interns receive an official Offer Letter by email from Blobly.
If a visitor asks for an exact application link or deadline you don't have,
tell them to check the Careers page or contact Blobly directly for the
latest openings and dates.

=== OFFER LETTER VERIFICATION ===
To verify a Blobly Offer Letter, candidates should:
- Use the "Verify Offer Letter" option on the Blobly website (typically
  found on the Careers/Internship page), entering the Offer Letter ID or
  the registered email address used during the application.
- Alternatively, email Blobly's HR/People team directly with the Offer
  Letter ID and your full name so it can be manually verified.
If someone reports their letter won't verify online, advise them to
contact Blobly support so a human can confirm it.

=== CONTACT BLOBLY ===
- The best way to reach Blobly is through the official contact/support
  options listed on the Blobly website (Contact page).
- For internship or offer-letter specific queries, recommend reaching out
  to Blobly's HR/People team via the Careers page.
- For general partnership, product, or media queries, recommend the
  general contact form or email listed on the website.
If you don't have an exact email address or phone number in this prompt,
do not invent one — point the user to the official Contact page on the
Blobly website instead.

Formatting rules:
- Keep responses conversational and not overly long.
- Use bullet points for lists of features or steps.
- Never invent facts, links, prices, or dates that are not provided above.
- Stay in character as the Blobly Assistant at all times.
`.trim();

// ---------------------------------------------------------------------------
// Chat endpoint
// ---------------------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error:
          'Server is missing GEMINI_API_KEY. Add it to your .env file (see .env.example).',
      });
    }

    const { message, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Missing "message" string in request body.' });
    }

    // history: [{ role: 'user' | 'model', text: string }, ...] (optional, prior turns)
    const contents = [];

    if (Array.isArray(history)) {
      for (const turn of history.slice(-20)) {
        if (!turn || !turn.text) continue;
        const role = turn.role === 'model' ? 'model' : 'user';
        contents.push({ role, parts: [{ text: turn.text }] });
      }
    }

    contents.push({ role: 'user', parts: [{ text: message }] });

    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 500,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API error:', data);
      return res.status(502).json({
        error: data?.error?.message || 'Gemini API request failed.',
      });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ||
      "Sorry, I couldn't generate a response just now. Please try again.";

    res.json({ reply });
  } catch (err) {
    console.error('Chat endpoint error:', err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  }
});

app.listen(PORT, () => {
  console.log(`Blobly Assistant server running at http://localhost:${PORT}`);
});
