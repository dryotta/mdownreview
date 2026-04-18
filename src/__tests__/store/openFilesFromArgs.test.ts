import { describe, it, expect, beforeEach } from "vitest";
import { useStore, openFilesFromArgs } from "@/store/index";

const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
});

// Helper: always call openFilesFromArgs with the current store state
function callOpenFilesFromArgs(files: string[], folders: string[]) {
  openFilesFromArgs(files, folders, useStore.getState());
}

describe("openFilesFromArgs – folders", () => {
  it("sets the workspace root to the first folder", () => {
    callOpenFilesFromArgs([], ["/workspace/project"]);
    expect(useStore.getState().root).toBe("/workspace/project");
  });

  it("uses only the first folder when multiple are supplied", () => {
    callOpenFilesFromArgs([], ["/first", "/second"]);
    expect(useStore.getState().root).toBe("/first");
  });

  it("does not set root when no folders are provided", () => {
    callOpenFilesFromArgs([], []);
    expect(useStore.getState().root).toBeNull();
  });

  it("resets expandedFolders when root is set via folder arg", () => {
    useStore.getState().setFolderExpanded("/old/folderA", true);
    callOpenFilesFromArgs([], ["/new/root"]);
    expect(useStore.getState().expandedFolders).toEqual({});
  });
});

describe("openFilesFromArgs – files", () => {
  it("opens a single file path as a tab", () => {
    callOpenFilesFromArgs(["/docs/readme.md"], []);
    const { tabs } = useStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0].path).toBe("/docs/readme.md");
  });

  it("opens multiple file paths as tabs", () => {
    callOpenFilesFromArgs(["/a.md", "/b.md", "/c.md"], []);
    const paths = useStore.getState().tabs.map((t) => t.path);
    expect(paths).toEqual(["/a.md", "/b.md", "/c.md"]);
  });

  it("sets the last opened file as the active tab", () => {
    callOpenFilesFromArgs(["/a.md", "/b.md"], []);
    expect(useStore.getState().activeTabPath).toBe("/b.md");
  });

  it("does not open a tab when files array is empty", () => {
    callOpenFilesFromArgs([], []);
    expect(useStore.getState().tabs).toHaveLength(0);
  });
});

describe("openFilesFromArgs – deduplication", () => {
  it("skips files that are already open", () => {
    // Pre-open a file via normal store action
    useStore.getState().openFile("/docs/readme.md");
    expect(useStore.getState().tabs).toHaveLength(1);

    // Now call openFilesFromArgs with the same file — must pass current state
    // so alreadyOpen reflects the pre-opened tab.
    openFilesFromArgs(["/docs/readme.md"], [], useStore.getState());

    expect(useStore.getState().tabs).toHaveLength(1);
  });

  it("opens only new files when a mix of old and new is supplied", () => {
    useStore.getState().openFile("/existing.md");

    openFilesFromArgs(["/existing.md", "/new.md"], [], useStore.getState());

    const paths = useStore.getState().tabs.map((t) => t.path);
    expect(paths).toContain("/existing.md");
    expect(paths).toContain("/new.md");
    expect(paths).toHaveLength(2);
  });

  it("deduplication works regardless of call order", () => {
    useStore.getState().openFile("/file.md");

    // Call twice; second call should also see the file as already open
    openFilesFromArgs(["/file.md"], [], useStore.getState());
    openFilesFromArgs(["/file.md"], [], useStore.getState());

    expect(useStore.getState().tabs).toHaveLength(1);
  });
});

describe("openFilesFromArgs – files and folders together", () => {
  it("sets root and opens files in the same call", () => {
    callOpenFilesFromArgs(["/workspace/notes.md"], ["/workspace"]);
    expect(useStore.getState().root).toBe("/workspace");
    expect(useStore.getState().tabs).toHaveLength(1);
    expect(useStore.getState().tabs[0].path).toBe("/workspace/notes.md");
  });
});
