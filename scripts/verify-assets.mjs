import { readFile } from "node:fs/promises";

const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const path = new URL("../docs/assets/infershape-hero.png", import.meta.url);
const image = await readFile(path);
const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
if (!image.subarray(0, 8).equals(signature)) throw new Error("InferShape hero is not a PNG.");
if (image.length < 30_000) throw new Error(`InferShape hero is unexpectedly small (${image.length} bytes).`);
const ihdr = image.indexOf(Buffer.from("IHDR"));
if (ihdr < 0) throw new Error("InferShape hero has no IHDR chunk.");
const width = image.readUInt32BE(ihdr + 4);
const height = image.readUInt32BE(ihdr + 8);
if (width !== 1536 || height !== 860) throw new Error(`InferShape hero must be 1536x860, got ${width}x${height}.`);
if (!readme.includes("docs/assets/infershape-hero.png")) throw new Error("README does not reference the PNG hero.");
process.stdout.write(`Hero verified: ${width}x${height}, ${image.length} bytes.\n`);
