import { describe, it, expect } from 'vitest';
import { identifyAdTimeRangeByGeminiAI } from "../../ai"
import { convertSubtitleObjToStr } from '../../util'

import { GoogleGenAI } from '@google/genai';
import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const subtitleFilesDir = join(__dirname, 'subtitle-files')
const files = readdirSync(subtitleFilesDir)

const apiKey = process.env.GOOGLE_GEMINI_API_KEY
const geminiClient = new GoogleGenAI({ apiKey });

describe('AI Ad Time Range Identification', async () => {
    for (const fileName of files) {
        it(`should return valid AdTimeRange for ${fileName}`, async () => {
            const filePath = join(subtitleFilesDir, fileName)
            const fileContent = readFileSync(filePath, {
                encoding: "utf-8"
            })
            const subStr = convertSubtitleObjToStr(JSON.parse(fileContent).body)

            const timeRange = await identifyAdTimeRangeByGeminiAI({
                geminiClient,
                subStr,
                aiModel: 'gemini-2.5-flash'
            })


            expect(timeRange).not.toBeNull();
            expect(timeRange).toBeDefined();
            if (!timeRange) {
                throw new Error(`Expected ad time range for ${fileName}`);
            }
            expect(timeRange).toHaveProperty('startTime')
            expect(timeRange).toHaveProperty('endTime')
            expect(typeof timeRange.startTime).toBe('number')
            expect(typeof timeRange.endTime).toBe('number')
            expect(timeRange.startTime).toBeGreaterThanOrEqual(0)
            expect(timeRange.endTime).toBeGreaterThanOrEqual(0)
            expect(timeRange.startTime).toBeLessThan(timeRange.endTime)
            expect(Number.isFinite(timeRange.startTime)).toBe(true)
            expect(Number.isFinite(timeRange.endTime)).toBe(true)
        }, 120000)
    }
})





