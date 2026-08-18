import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const VAULT_PATH = process.env.VAULT_PATH || './demo-vault';
const IMAGES_PATH = path.join(VAULT_PATH, 'images');

export async function POST(request: NextRequest) {
    try {
        const { url } = await request.json();

        if (!url) {
            return NextResponse.json({ error: '缺少图片URL' }, { status: 400 });
        }

        // 下载远程图片
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });

        if (!response.ok) {
            return NextResponse.json({ error: `下载失败: ${response.statusText}` }, { status: 400 });
        }

        // 获取图片数据
        const buffer = Buffer.from(await response.arrayBuffer());

        // 生成唯一文件名（使用内容哈希，和上传接口保持一致）
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');

        // 从URL或Content-Type确定文件扩展名
        let extension = 'jpg'; // 默认扩展名
        const contentType = response.headers.get('content-type');
        if (contentType) {
            const extMap: Record<string, string> = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/gif': 'gif',
                'image/webp': 'webp',
                'image/svg+xml': 'svg',
                'image/bmp': 'bmp',
            };
            extension = extMap[contentType] || 'jpg';
        } else {
            // 从URL尝试提取扩展名
            const urlExt = url.split('.').pop()?.split('?')[0];
            if (urlExt && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(urlExt)) {
                extension = urlExt;
            }
        }

        const filename = `${hash}.${extension}`;
        const filePath = path.join(IMAGES_PATH, filename);

        // 确保目录存在
        if (!fs.existsSync(IMAGES_PATH)) {
            fs.mkdirSync(IMAGES_PATH, { recursive: true });
        }

        // 如果图片已存在，直接返回（去重逻辑）
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, buffer);
        }

        return NextResponse.json({
            success: true,
            filename,
            path: `images/${filename}`,
        });
    } catch (error) {
        console.error('下载远程图片出错:', error);
        return NextResponse.json({ error: '下载远程图片失败' }, { status: 500 });
    }
}