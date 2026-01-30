import Redis from "ioredis";
import { randomUUID } from "crypto";

export type VerificationJob = {
  id: string;
  messageId: string;
  channelId: string;
  guildId: string;
  userId: string;
  xUrl: string;
  claimedUsername: string;
};

export type VerificationResult = {
  jobId: string;
  projectId: string;
  score: number;
  confidence: number;
  role: string;
  xUrl: string;
  userId: string;
  channelId: string;
  guildId: string;
};

const JOB_QUEUE = "verification_jobs";
const RESULT_QUEUE = "verification_results";

const projects = ["A", "B", "C", "D"] as const;

function hashString(value: string): number {
  return value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function buildFakeResult(job: VerificationJob): VerificationResult {
  const scoreSeed = hashString(job.userId + job.xUrl);
  const projectId = projects[scoreSeed % projects.length];
  const score = 50 + (scoreSeed % 50);
  const confidence = 60 + (scoreSeed % 40);

  return {
    jobId: job.id,
    projectId,
    score,
    confidence,
    role: `Project ${projectId}`,
    xUrl: job.xUrl,
    userId: job.userId,
    channelId: job.channelId,
    guildId: job.guildId,
  };
}

export function createQueue(redisUrl: string) {
  const client = new Redis(redisUrl);
  const resultClient = new Redis(redisUrl);
  let workerClient: Redis | null = null;
  let listening = true;
  let workerRunning = false;

  async function enqueueJob(payload: Omit<VerificationJob, "id">): Promise<VerificationJob> {
    const job: VerificationJob = { id: randomUUID(), ...payload };
    await client.lpush(JOB_QUEUE, JSON.stringify(job));
    return job;
  }

  async function startResultListener(onResult: (result: VerificationResult) => Promise<void>) {
    while (listening) {
      const response = await resultClient.brpop(RESULT_QUEUE, 0);
      if (!response) {
        continue;
      }
      const [, raw] = response;
      const parsed = JSON.parse(raw) as VerificationResult;
      await onResult(parsed);
    }
  }

  async function startStubWorker() {
    if (workerRunning) {
      return;
    }
    workerRunning = true;
    workerClient = new Redis(redisUrl);

    while (listening) {
      const response = await workerClient.brpop(JOB_QUEUE, 0);
      if (!response) {
        continue;
      }
      const [, raw] = response;
      const job = JSON.parse(raw) as VerificationJob;
      const result = buildFakeResult(job);
      await workerClient.lpush(RESULT_QUEUE, JSON.stringify(result));
    }
  }

  async function close() {
    listening = false;
    await client.quit();
    await resultClient.quit();
    if (workerClient) {
      await workerClient.quit();
    }
  }

  return {
    enqueueJob,
    startResultListener,
    startStubWorker,
    close,
  };
}
