
import { en } from './en/index';
import { zhSG } from './zh-SG/index';

/**
 * 【成熟架构：资源字典聚合】
 * 目的：解耦具体语言文件与 Context 的直接引用。
 * 优势：后续增加语言（如 ja, ko）只需在此注册，Context 无需修改逻辑。
 */
export const locales = {
  en,
  'zh-SG': zhSG
};

export type { I18nSchema } from './types';
