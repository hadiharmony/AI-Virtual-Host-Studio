const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = process.env.GCP_PROJECT || "demo-no-project";
const ALICE_UID = "alice_host_123";
const BOB_UID = "bob_host_456";

const [emulatorHost, emulatorPortStr] = (
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085"
).split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

const pastDate = (offsetMs = 5000) => new Date(Date.now() - offsetMs);
const futureDate = () => new Date(Date.now() + 60000);

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

// 1. Unauthenticated access denial across collections
test("Unauthenticated user cannot read or write any studio collection", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(unauthDb.collection("users").doc(ALICE_UID).get());
  await assertFails(
    unauthDb.collection("users").doc(ALICE_UID).collection("characters").get()
  );
  await assertFails(
    unauthDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("characters")
      .doc("char_1")
      .set({
        userId: ALICE_UID,
        name: "Aria",
        displayName: "Aria Studio",
        language: "Bahasa Indonesia",
        voiceSelection: "Android TTS — Indonesia",
        avatarProvider: "NONE",
        avatarRegistered: false,
        portraitAssetKey: "aria",
        active: true,
        createdAt: pastDate(),
        updatedAt: pastDate(),
      })
  );
});

// 2. UserProfile CRUD & Cross-user isolation & Ghost field rejection
test("UserProfile allows owner create/update and blocks cross-user & ghost fields", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const created = pastDate(10000);

  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).set({
      userId: ALICE_UID,
      displayName: "Creator Alice",
      email: "alice@example.com",
      activeCharacterId: "",
      darkThemeMode: "DARK",
      dailyCostLimitUsd: 5.0,
      maxDailyRequests: 500,
      createdAt: created,
      updatedAt: created,
    })
  );

  // Partial update allowed keys
  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).update({
      activeCharacterId: "char_aria",
      dailyCostLimitUsd: 10.0,
      updatedAt: pastDate(1000),
    })
  );

  // Cross-user read & write blocked
  await assertFails(bobDb.collection("users").doc(ALICE_UID).get());
  await assertFails(
    bobDb.collection("users").doc(ALICE_UID).update({
      displayName: "Hijacked",
      updatedAt: pastDate(500),
    })
  );

  // Shadow update with ghost field blocked
  await assertFails(
    aliceDb.collection("users").doc(ALICE_UID).update({
      isAdmin: true,
      updatedAt: pastDate(500),
    })
  );

  // Tampered future timestamp blocked
  await assertFails(
    aliceDb.collection("users").doc(ALICE_UID).update({
      dailyCostLimitUsd: 15.0,
      updatedAt: futureDate(),
    })
  );
});

// 3. Characters CRUD, @DocumentId id rejection, active toggle & cross-user isolation
test("Characters enforce Kotlin payload parity, ownership, and reject @DocumentId body field", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const created = pastDate(10000);

  const validChar = {
    userId: ALICE_UID,
    name: "Aria Nusantara",
    displayName: "Aria Live",
    biography: "Host virtual ramah untuk edukasi teknologi & sains.",
    personalityDescription: "Ceria, komunikatif, teliti.",
    speakingStyle: "Santai tapi informatif, Bahasa Indonesia natural.",
    language: "Bahasa Indonesia",
    voiceSelection: "Android TTS — id-ID",
    avatarProvider: "NONE",
    avatarReferenceId: "",
    avatarRegistered: false,
    appearanceDescription: "Blazer gelap aksen cyan, studio modern.",
    portraitAssetKey: "aria",
    backgroundPreference: "Studio Obsidian Neon",
    active: true,
    createdAt: created,
    updatedAt: created,
  };

  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("characters")
      .doc("char_aria")
      .set(validChar)
  );

  // List query matches Kotlin repository
  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).collection("characters").get()
  );

  // Partial update: toggle active
  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("characters")
      .doc("char_aria")
      .update({
        active: false,
        updatedAt: pastDate(1000),
      })
  );

  // Reject body containing @DocumentId 'id'
  await assertFails(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("characters")
      .doc("char_bad")
      .set({
        id: "char_bad",
        ...validChar,
      })
  );

  // Cross-user list & delete rejected
  await assertFails(
    bobDb.collection("users").doc(ALICE_UID).collection("characters").get()
  );
  await assertFails(
    bobDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("characters")
      .doc("char_aria")
      .delete()
  );
});

// 4. AI Brain Config & Knowledge Documents + Chunks
test("AI Brain Config and Knowledge Center documents/chunks validate cleanly", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const created = pastDate(10000);

  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("ai_personalities")
      .doc("char_aria")
      .set({
        userId: ALICE_UID,
        characterId: "char_aria",
        llmProvider: "GEMINI_AI_LOGIC",
        modelName: "gemini-3.8-flash",
        personalityPreset: "FRIENDLY",
        customPersonalityInstructions: "Gunakan bahasa Indonesia santai.",
        systemPrompt: "Kamu adalah Aria, AI Virtual Host.",
        conversationContext: "Sesi edukasi teknologi harian.",
        memorySummary: "Penonton menyukai topik AI & gadget.",
        responseLength: "MEDIUM",
        contentRestrictions: "Hindari hoaks dan SARA.",
        moderationRules: "Saring spam dan komentar kasar.",
        temperature: 0.7,
        admitUncertainty: true,
        createdAt: created,
        updatedAt: created,
      })
  );

  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("knowledge_documents")
      .doc("doc_1")
      .set({
        userId: ALICE_UID,
        title: "Sejarah Borobudur",
        category: "SEJARAH",
        sourceType: "MANUAL",
        sourceInfo: "Catatan Kurator",
        content: "Candi Borobudur dibangun pada abad ke-8 hingga ke-9 Masehi.",
        chunkCount: 1,
        processingStatus: "INDEXED",
        errorMessage: "",
        verified: true,
        createdAt: created,
        updatedAt: created,
      })
  );

  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("knowledge_chunks")
      .doc("chunk_1")
      .set({
        userId: ALICE_UID,
        documentId: "doc_1",
        documentTitle: "Sejarah Borobudur",
        category: "SEJARAH",
        chunkIndex: 0,
        text: "Candi Borobudur dibangun pada abad ke-8 hingga ke-9 Masehi.",
        keywords: ["candi", "borobudur", "abad", "sejarah"],
        createdAt: created,
      })
  );

  // Chunks are immutable on update
  await assertFails(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("knowledge_chunks")
      .doc("chunk_1")
      .update({ text: "Mutated" })
  );
});

// 5. Livestream Sessions Terminal State Locking & Autonomous Config & Integrations
test("Livestream sessions enforce terminal state locking and integrations/usage/logs work", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const created = pastDate(10000);

  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("livestream_sessions")
      .doc("sess_1")
      .set({
        userId: ALICE_UID,
        characterId: "char_aria",
        characterName: "Aria Live",
        platform: "SIMULATOR",
        simulated: true,
        status: "ACTIVE",
        durationSeconds: 0,
        commentsCount: 0,
        questionsCount: 0,
        aiResponsesCount: 0,
        filteredSpamCount: 0,
        avgLatencyMs: 0,
        estimatedTokens: 0,
        estimatedCostUsd: 0.0,
        errorCount: 0,
        startedAt: created,
        updatedAt: created,
      })
  );

  // End the session cleanly
  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("livestream_sessions")
      .doc("sess_1")
      .update({
        status: "ENDED",
        durationSeconds: 180,
        commentsCount: 12,
        aiResponsesCount: 10,
        endedAt: pastDate(1000),
        updatedAt: pastDate(1000),
      })
  );

  // Terminal state lock: cannot reopen or edit an ENDED session
  await assertFails(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("livestream_sessions")
      .doc("sess_1")
      .update({
        status: "ACTIVE",
        updatedAt: pastDate(500),
      })
  );

  // Autonomous config
  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("autonomous_configs")
      .doc("char_aria")
      .set({
        userId: ALICE_UID,
        characterId: "char_aria",
        enabled: true,
        currentMode: "INTERACTIVE",
        openingScript: "Halo semuanya! Selamat datang di sesi live hari ini.",
        closingScript: "Terima kasih sudah menonton! Sampai jumpa di sesi berikutnya.",
        quietPeriodSeconds: 20,
        speechIntervalSeconds: 15,
        maxSessionDurationMinutes: 60,
        scheduledTimeLabel: "Setiap Hari 19:00 WIB",
        selectedTopics: ["Teknologi", "Sains", "Sejarah"],
        customTopicInstructions: "Fokus pada fakta terverifikasi.",
        createdAt: created,
        updatedAt: created,
      })
  );

  // Integration setting
  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("integration_settings")
      .doc("TIKTOK_LIVE")
      .set({
        userId: ALICE_UID,
        providerKey: "TIKTOK_LIVE",
        category: "LIVESTREAM",
        displayName: "TikTok LIVE Connector",
        status: "UNCONFIGURED",
        endpointUrl: "",
        configNotes: "Memerlukan persetujuan resmi TikTok Developer.",
        lastError: "",
        createdAt: created,
        updatedAt: created,
      })
  );

  // Usage record & system log (append-only)
  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("usage_records")
      .doc("usage_1")
      .set({
        userId: ALICE_UID,
        sessionId: "sess_1",
        provider: "GEMINI_AI_LOGIC",
        modelName: "gemini-3.8-flash",
        operation: "LIVE_SIMULATOR",
        promptTokensEst: 320,
        outputTokensEst: 110,
        estimatedCostUsd: 0.00018,
        latencyMs: 920,
        simulated: true,
        createdAt: created,
      })
  );

  await assertSucceeds(
    aliceDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("system_logs")
      .doc("log_1")
      .set({
        userId: ALICE_UID,
        level: "SAFETY",
        module: "LIVE_CONTROL",
        message: "Emergency Stop diuji dalam mode simulasi.",
        createdAt: created,
      })
  );
});
