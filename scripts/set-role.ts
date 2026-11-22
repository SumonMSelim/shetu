/**
 * Assign a platform role to a user (bootstrap for mentors and admins).
 *
 * Usage:
 *   npm run set-role -- <userId-or-email> <student|mentor|admin>
 *
 * Looks up the user's PROFILE item by userId first, then by email (a Scan over
 * PROFILE items; the dataset is small). If given a Google sub (numeric) with no
 * profile yet, creates a shell profile so a mentor can be provisioned before
 * their first chat. Needs AWS credentials and SHETU_TABLE_NAME, like the app.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { config } from "../src/lib/config";

const [, , who, roleArg] = process.argv;
const ROLES = ["student", "mentor", "admin"] as const;
type Role = (typeof ROLES)[number];

if (!who || !roleArg || !ROLES.includes(roleArg as Role)) {
  console.error("Usage: npm run set-role -- <userId-or-email> <student|mentor|admin>");
  process.exit(2);
}
const role = roleArg as Role;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.aws.region }), {
  marshallOptions: { removeUndefinedValues: true },
});
const TABLE = config.storage.tableName;

interface ProfileItem {
  PK: string;
  userId?: string;
  email?: string;
  name?: string;
  role?: string;
}

async function findUser(idOrEmail: string): Promise<ProfileItem | null> {
  // Direct key lookup first: a Google sub used as the userId.
  const direct = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `USER#${idOrEmail}`, SK: "PROFILE" } }),
  );
  if (direct.Item) return direct.Item as ProfileItem;
  // Fall back to email match over PROFILE items.
  const res = await ddb.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "SK = :p AND email = :e",
      ExpressionAttributeValues: { ":p": "PROFILE", ":e": idOrEmail },
    }),
  );
  return (res.Items?.[0] as ProfileItem | undefined) ?? null;
}

const user = await findUser(who);

if (!user) {
  // A Google sub that has never signed in cannot be looked up by email, but we
  // can still provision the role in a shell profile it will adopt on sign-in.
  if (/^\d{10,30}$/.test(who)) {
    const now = new Date().toISOString();
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: { PK: `USER#${who}`, SK: "PROFILE", userId: who, role, updatedAt: now },
      }),
    );
    console.log(`Created shell profile and set role "${role}" for userId ${who}.`);
    process.exit(0);
  }
  console.error(
    `No profile found for "${who}". The user must sign in and share their details once so a profile exists, or pass their Google userId (a numeric sub).`,
  );
  process.exit(1);
}

await ddb.send(
  new UpdateCommand({
    TableName: TABLE,
    Key: { PK: user.PK, SK: "PROFILE" },
    UpdateExpression: "SET #r = :r, #u = :u",
    ConditionExpression: "attribute_exists(PK)",
    ExpressionAttributeNames: { "#r": "role", "#u": "updatedAt" },
    ExpressionAttributeValues: { ":r": role, ":u": new Date().toISOString() },
  }),
);
console.log(`Role "${role}" set for ${user.email ?? user.userId ?? user.PK}.`);
