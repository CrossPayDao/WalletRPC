import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { TiltCard } from '../../components/ui/TiltCard';

const mockMatchMedia = (matches: boolean) => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }) as any);
};

describe('TiltCard', () => {
  it('桌面端 hover/move 时会更新倾斜 transform 与高光', () => {
    mockMatchMedia(true);

    const { container } = render(
      <TiltCard intensity={20}>
        <div>content</div>
      </TiltCard>
    );

    const root = container.firstElementChild as HTMLDivElement;
    const glow = container.querySelector('.absolute.inset-0') as HTMLDivElement;
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      toJSON: () => {}
    });

    fireEvent.mouseEnter(root);
    fireEvent.mouseMove(root, { clientX: 150, clientY: 30 });

    expect(root.style.transform).toContain('rotateX');
    expect(root.style.transform).toContain('rotateY');
    expect(glow.style.opacity).toBe('1');
    expect(glow.style.background).toContain('radial-gradient');

    fireEvent.mouseLeave(root);
    expect(root.style.transform).toContain('rotateX(0deg)');
    expect(glow.style.opacity).toBe('0');
  });

  it('非桌面端事件不会触发倾斜动画', () => {
    mockMatchMedia(false);

    const { container } = render(
      <TiltCard>
        <div>content</div>
      </TiltCard>
    );

    const root = container.firstElementChild as HTMLDivElement;
    const glow = container.querySelector('.absolute.inset-0') as HTMLDivElement;

    fireEvent.mouseEnter(root);
    fireEvent.mouseMove(root, { clientX: 120, clientY: 60 });
    fireEvent.mouseLeave(root);

    expect(root.style.transform).toBe('');
    expect(glow.style.opacity).toBe('0');
  });
});
