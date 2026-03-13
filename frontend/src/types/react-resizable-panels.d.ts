declare module 'react-resizable-panels' {
  import { ReactNode, CSSProperties } from 'react';

  interface GroupProps {
    children: ReactNode;
    direction: 'horizontal' | 'vertical';
    className?: string;
    style?: CSSProperties;
    id?: string;
  }

  interface PanelProps {
    children: ReactNode;
    defaultSize?: number;
    minSize?: number;
    maxSize?: number;
    className?: string;
    style?: CSSProperties;
    id?: string;
  }

  interface SeparatorProps {
    className?: string;
    style?: CSSProperties;
    id?: string;
  }

  export function Group(props: GroupProps): JSX.Element;
  export function Panel(props: PanelProps): JSX.Element;
  export function Separator(props: SeparatorProps): JSX.Element;
}
