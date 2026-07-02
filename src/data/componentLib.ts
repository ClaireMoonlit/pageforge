import type { ComponentDef } from '@/types'

/**
 * 内置组件库
 * 拖入画布时以此为基础生成节点，再叠加位置坐标
 */
export const componentLib: ComponentDef[] = [
  {
    type: 'heading',
    label: '标题',
    icon: { type: 'svg', value: 'heading' },
    defaultProps: { text: '点击编辑标题', level: 1 },
    defaultStyle: {
      maxWidth: '100%',
      fontSize: '32px',
      fontWeight: '700',
      color: '#0b0f1a',
      padding: '8px 0',
      textAlign: 'center',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: '1.3',
      wordBreak: 'break-word',
    },
  },
  {
    type: 'text',
    label: '正文',
    icon: { type: 'svg', value: 'text' },
    defaultProps: { text: '这是一段正文，双击可编辑内容。' },
    defaultStyle: {
      fontSize: '16px',
      color: '#374151',
      padding: '4px 0',
      textAlign: 'left',
      lineHeight: '1.7',
    },
  },
  {
    type: 'image',
    label: '图片',
    icon: { type: 'svg', value: 'image' },
    defaultProps: { src: '', alt: '图片' },
    defaultStyle: {
      width: '320px',
      height: '180px',
      borderRadius: '8px',
      backgroundColor: '#e5e7eb',
    },
  },
  {
    type: 'button',
    label: '按钮',
    icon: { type: 'svg', value: 'button' },
    defaultProps: { text: '立即了解' },
    defaultStyle: {
      fontSize: '16px',
      fontWeight: '600',
      color: '#ffffff',
      backgroundColor: '#6366f1',
      padding: '12px 24px',
      borderRadius: '8px',
      textAlign: 'center',
    },
  },
  {
    type: 'card',
    label: '卡片',
    icon: { type: 'svg', value: 'card' },
    defaultProps: { text: '卡片标题', subtitle: '卡片描述文字，可在此介绍特点。', titleFontSize: '18px', titleColor: '#000000', subtitleFontSize: '14px', subtitleColor: '#6b7280' },
    defaultStyle: {
      width: '280px',
      padding: '20px',
      backgroundColor: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
  },
  {
    type: 'container',
    label: '容器',
    icon: { type: 'svg', value: 'container' },
    defaultProps: {},
    defaultStyle: {
      width: '480px',
      minHeight: '120px',
      padding: '16px',
      backgroundColor: '#f9fafb',
      borderRadius: '8px',
      position: 'relative',
    },
  },
  {
    type: 'divider',
    label: '分隔线',
    icon: { type: 'svg', value: 'divider' },
    defaultProps: {},
    defaultStyle: {
      width: '100%',
      height: '1px',
      backgroundColor: '#e5e7eb',
      display: 'block',
    },
  },
  {
    type: 'icon',
    label: '图标',
    icon: { type: 'svg', value: 'icon' },
    defaultProps: { icon: 'star', text: '图标文字' },
    defaultStyle: {
      fontSize: '24px',
      color: '#6366f1',
      padding: '8px',
      textAlign: 'center',
      lineHeight: '1.4',
    },
  },
  {
    type: 'video',
    label: '视频',
    icon: { type: 'svg', value: 'video' },
    defaultProps: { src: '', poster: '' },
    defaultStyle: {
      width: '560px',
      height: '315px',
      backgroundColor: '#000000',
      borderRadius: '8px',
    },
  },
  {
    type: 'input',
    label: '输入框',
    icon: { type: 'svg', value: 'input' },
    defaultProps: { placeholder: '请输入内容...', text: '' },
    defaultStyle: {
      width: '280px',
      minHeight: '40px',
      fontSize: '14px',
      color: '#374151',
      padding: '10px 14px',
      borderRadius: '8px',
      border: '1px solid #d1d5db',
      backgroundColor: '#ffffff',
    },
  },
  {
    type: 'navbar',
    label: '导航栏',
    icon: { type: 'svg', value: 'navbar' },
    defaultProps: { logo: 'PageForge', navLinks: '首页,关于,服务,联系' },
    defaultStyle: {
      width: '1200px',
      height: '64px',
      padding: '0 24px',
      backgroundColor: '#ffffff',
      borderBottom: '1px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '16px',
      fontWeight: '500',
      color: '#374151',
    },
  },
  {
    type: 'grid',
    label: '网格布局',
    icon: { type: 'svg', value: 'grid' },
    defaultProps: { columns: 3, gridGap: '16px' },
    defaultStyle: {
      width: '1200px',
      minHeight: '200px',
      padding: '24px',
      backgroundColor: '#f9fafb',
      borderRadius: '8px',
      display: 'grid',
      gap: '16px',
    },
  },
  {
    type: 'form',
    label: '表单',
    icon: { type: 'svg', value: 'form' },
    defaultProps: { fields: '姓名,邮箱,留言', submitText: '提交' },
    defaultStyle: {
      width: '480px',
      padding: '24px',
      backgroundColor: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
  },
]

/** 按 type 查找组件定义 */
export function findComponentDef(type: string): ComponentDef | undefined {
  return componentLib.find((c) => c.type === type)
}
