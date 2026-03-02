import crypto from 'crypto';
import { config } from '../config';

interface Code2SessionResult {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

interface DecryptedPhoneData {
  phoneNumber: string;
  purePhoneNumber: string;
  countryCode: string;
  watermark: {
    timestamp: number;
    appid: string;
  };
}

/**
 * 调用微信 jscode2session API 获取用户 openid 和 session_key
 * @param code 微信登录凭证
 * @returns 包含 openid 和 session_key 的对象
 */
export async function code2Session(code: string): Promise<Code2SessionResult> {
  const { wechatAppId, wechatSecret } = config;

  if (!wechatAppId || !wechatSecret) {
    throw new Error('微信小程序 AppID 或 Secret 未配置');
  }

  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', wechatAppId);
  url.searchParams.set('secret', wechatSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  const response = await fetch(url.toString());
  const data = await response.json() as Code2SessionResult;

  if (data.errcode) {
    throw new Error(`微信登录失败: ${data.errmsg} (${data.errcode})`);
  }

  return data;
}

/**
 * 解密微信手机号数据
 * @param encryptedData 加密数据
 * @param iv 初始向量
 * @param sessionKey 会话密钥
 * @returns 解密后的手机号数据
 */
export function decryptPhoneNumber(
  encryptedData: string,
  iv: string,
  sessionKey: string
): DecryptedPhoneData {
  try {
    // Base64 解码
    const sessionKeyBuffer = Buffer.from(sessionKey, 'base64');
    const encryptedDataBuffer = Buffer.from(encryptedData, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');

    // AES-128-CBC 解密
    const decipher = crypto.createDecipheriv('aes-128-cbc', sessionKeyBuffer, ivBuffer);
    decipher.setAutoPadding(true);

    let decoded = decipher.update(encryptedDataBuffer, undefined, 'utf8');
    decoded += decipher.final('utf8');

    const data = JSON.parse(decoded) as DecryptedPhoneData;

    // 验证 watermark 中的 appid
    if (data.watermark && data.watermark.appid !== config.wechatAppId) {
      throw new Error('水印验证失败：AppID 不匹配');
    }

    return data;
  } catch (error: any) {
    console.error('解密手机号失败:', error);
    throw new Error('解密手机号失败: ' + (error.message || '未知错误'));
  }
}
