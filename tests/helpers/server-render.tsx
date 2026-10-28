import { isValidElement, type ReactElement, type ReactNode } from "react";
import { render } from "@testing-library/react";

type AsyncComponent = (props: Record<string, unknown>) => Promise<ReactNode>;

function isAsyncComponent(type: unknown): type is AsyncComponent {
  return typeof type === "function" && type.constructor.name === "AsyncFunction";
}

/** Resolves async Server Components (and any async components in their children) into plain elements. */
export async function resolveServer(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map((child) => resolveServer(child as ReactNode)));
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (isAsyncComponent(element.type)) {
    return resolveServer(await element.type(element.props as Record<string, unknown>));
  }
  const { children } = element.props;
  if (children === undefined) return element;
  return { ...element, props: { ...element.props, children: await resolveServer(children) } } as ReactElement;
}

/** `render` for trees that contain async Server Components. */
export async function renderServer(node: ReactNode) {
  return render(<>{await resolveServer(node)}</>);
}

export async function rerenderServer(rerender: (ui: ReactNode) => void, node: ReactNode) {
  rerender(<>{await resolveServer(node)}</>);
}
