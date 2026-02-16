import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { HttpConsoleProvider, useHttpConsole } from '../../contexts/HttpConsoleContext';
import { LanguageProvider } from '../../contexts/LanguageContext';

describe('HttpConsoleContext hook', () => {
  it('未被 Provider 包裹时应抛错', () => {
    expect(() => renderHook(() => useHttpConsole())).toThrow(/Missing HttpConsoleProvider/);
  });

  it('open 与 clear 应更新上下文状态', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageProvider>
        <HttpConsoleProvider>{children}</HttpConsoleProvider>
      </LanguageProvider>
    );

    const { result } = renderHook(() => useHttpConsole(), { wrapper });

    act(() => {
      result.current.open();
    });
    expect(result.current.enabled).toBe(true);
    expect(result.current.expanded).toBe(true);

    act(() => {
      result.current.clear();
    });
    expect(result.current.events).toEqual([]);
  });
});

