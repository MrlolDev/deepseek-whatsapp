import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface CacheEntry {
    type: 'transcription' | 'image';
    data: string;
    originalInput: string;
    timestamp: string;
}

interface CacheData {
    [key: string]: CacheEntry;
}

export class CacheManager {
    private static instance: CacheManager;
    private cacheFile: string;
    private cache: CacheData = {}; // Initialize with empty object
    private readonly EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours

    private constructor() {
        this.cacheFile = path.join(process.cwd(), 'ai-cache.json');
        this.initializeCache();
        this.startCleanupInterval();
    }

    public static getInstance(): CacheManager {
        if (!CacheManager.instance) {
            CacheManager.instance = new CacheManager();
        }
        return CacheManager.instance;
    }

    private initializeCache(): void {
        try {
            if (!fs.existsSync(this.cacheFile)) {
                fs.writeFileSync(this.cacheFile, JSON.stringify({}, null, 2));
            }
            const cacheContent = fs.readFileSync(this.cacheFile, 'utf-8');
            this.cache = JSON.parse(cacheContent);
            this.cleanExpiredEntries();
        } catch (error) {
            console.error('Error initializing cache:', error);
            this.cache = {};
        }
    }

    private saveCache(): void {
        try {
            fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
        } catch (error) {
            console.error('Error saving cache:', error);
        }
    }

    private generateKey(input: string, type: 'transcription' | 'image'): string {
        return crypto.createHash('sha256').update(`${type}:${input}`).digest('hex');
    }

    private isExpired(timestamp: string): boolean {
        const entryTime = new Date(timestamp).getTime();
        const now = new Date().getTime();
        return now - entryTime > this.EXPIRATION_MS;
    }

    private cleanExpiredEntries(): void {
        const newCache: CacheData = {};
        Object.entries(this.cache).forEach(([key, entry]) => {
            if (!this.isExpired(entry.timestamp)) {
                newCache[key] = entry;
            }
        });
        this.cache = newCache;
        this.saveCache();
    }

    private startCleanupInterval(): void {
        // Run cleanup every hour
        setInterval(() => this.cleanExpiredEntries(), 60 * 60 * 1000);
    }

    public get(input: string, type: 'transcription' | 'image'): string | null {
        const key = this.generateKey(input, type);
        const entry = this.cache[key];

        if (!entry || this.isExpired(entry.timestamp)) {
            if (entry) {
                // Remove expired entry
                delete this.cache[key];
                this.saveCache();
            }
            return null;
        }

        return entry.data;
    }

    public set(input: string, data: string, type: 'transcription' | 'image'): void {
        const key = this.generateKey(input, type);
        this.cache[key] = {
            type,
            data,
            originalInput: input,
            timestamp: new Date().toISOString()
        };
        this.saveCache();
    }
}
