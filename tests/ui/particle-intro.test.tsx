import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { ParticleIntro } from '../../components/ui/ParticleIntro';

describe('ParticleIntro', () => {
  it('挂载时创建 canvas，并在卸载时清理动画与监听器', () => {
    const ctx = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      setTransform: vi.fn(),
      fillStyle: ''
    } as any;

    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(ctx);

    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    const { container, unmount } = render(
      <LanguageProvider>
        <ParticleIntro />
      </LanguageProvider>
    );

    expect(container.querySelector('canvas')).toBeInTheDocument();
    expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(rafSpy).toHaveBeenCalled();

    unmount();

    expect(cancelSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    getContextSpy.mockRestore();
  });

  it('fadeOut=true 时应用淡出样式', () => {
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        setTransform: vi.fn(),
        fillStyle: ''
      } as any);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    const { container } = render(
      <LanguageProvider>
        <ParticleIntro fadeOut />
      </LanguageProvider>
    );

    const root = container.querySelector('div.fixed.inset-0');
    expect(root?.className).toContain('opacity-0');
    expect(root?.className).toContain('blur-2xl');

    getContextSpy.mockRestore();
  });

  it('canvas context 不可用时应提前退出动画初始化', () => {
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);
    const addSpy = vi.spyOn(window, 'addEventListener');
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');

    const { container, unmount } = render(
      <LanguageProvider>
        <ParticleIntro />
      </LanguageProvider>
    );

    expect(container.querySelector('canvas')).toBeInTheDocument();
    expect(addSpy).not.toHaveBeenCalledWith('resize', expect.any(Function));
    expect(rafSpy).not.toHaveBeenCalled();

    unmount();
    expect(cancelSpy).not.toHaveBeenCalled();
    getContextSpy.mockRestore();
  });

  it('触发 resize 时会重新设置画布尺寸；rafId=0 时卸载不调用 cancelAnimationFrame', () => {
    const ctx = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      setTransform: vi.fn(),
      fillStyle: ''
    } as any;
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(ctx);

    let resizeHandler: ((e: Event) => void) | null = null;
    const addSpy = vi.spyOn(window, 'addEventListener').mockImplementation((type: any, cb: any) => {
      if (type === 'resize') resizeHandler = cb;
    });
    const removeSpy = vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    const { unmount } = render(
      <LanguageProvider>
        <ParticleIntro />
      </LanguageProvider>
    );

    expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(ctx.setTransform).toHaveBeenCalledTimes(1);
    resizeHandler?.(new Event('resize'));
    expect(ctx.setTransform).toHaveBeenCalledTimes(2);

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(rafSpy).toHaveBeenCalled();
    expect(cancelSpy).not.toHaveBeenCalled();
    getContextSpy.mockRestore();
  });
});
