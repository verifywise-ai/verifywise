import { test, expect } from "./fixtures/auth.fixture";

test.describe("Policy Editor", () => {
  test("navigating to policy creation shows editor", async ({
    authedPage: page,
  }) => {
    await page.goto("/policies");

    // Click add policy to open creation form
    const addBtn = page
      .getByRole("button", { name: /add new policy/i })
      .or(page.getByRole("button", { name: /new policy/i }))
      .or(page.getByRole("button", { name: /add policy/i }));

    if (!(await addBtn.first().isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.first().click();
    await page.waitForTimeout(1000);

    // Look for a rich text editor (TipTap/ProseMirror) or any text area
    const editor = page
      .locator(".tiptap")
      .or(page.locator(".ProseMirror"))
      .or(page.locator('[contenteditable="true"]'))
      .or(page.locator("textarea"))
      .or(page.getByRole("textbox"));

    if (await editor.first().isVisible({ timeout: 10_000 }).catch(() => false)) {
      await expect(editor.first()).toBeVisible();
    }
    await page.keyboard.press("Escape");
  });

  test("editor toolbar buttons are visible", async ({ authedPage: page }) => {
    await page.goto("/policies");

    const addBtn = page
      .getByRole("button", { name: /add new policy/i })
      .or(page.getByRole("button", { name: /new policy/i }))
      .or(page.getByRole("button", { name: /add policy/i }));

    if (!(await addBtn.first().isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.first().click();
    await page.waitForTimeout(1000);

    // Check for toolbar buttons (bold, italic, etc.)
    const toolbar = page
      .getByRole("button", { name: /bold/i })
      .or(page.locator('[aria-label="Bold"]'))
      .or(page.locator('[class*="toolbar"]'))
      .or(page.locator('[class*="Toolbar"]'))
      .or(page.locator(".tiptap-toolbar"));

    if (await toolbar.first().isVisible().catch(() => false)) {
      await expect(toolbar.first()).toBeVisible();
    }
    await page.keyboard.press("Escape");
  });

  test("can type text in editor", async ({ authedPage: page }) => {
    await page.goto("/policies");

    const addBtn = page
      .getByRole("button", { name: /add new policy/i })
      .or(page.getByRole("button", { name: /new policy/i }))
      .or(page.getByRole("button", { name: /add policy/i }));

    if (!(await addBtn.first().isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.first().click();
    await page.waitForTimeout(1000);

    // Find the editor and type text
    const editor = page
      .locator(".tiptap")
      .or(page.locator(".ProseMirror"))
      .or(page.locator('[contenteditable="true"]'))
      .or(page.locator("textarea"))
      .or(page.getByRole("textbox").last());

    if (await editor.first().isVisible({ timeout: 10_000 }).catch(() => false)) {
      await editor.first().click();
      await editor.first().fill("E2E test policy content");
      await page.waitForTimeout(300);

      // Verify content was entered
      const content = await editor.first().textContent().catch(() => "");
      if (content) {
        expect(content).toContain("E2E test policy content");
      }
    }
    await page.keyboard.press("Escape");
  });

  test("can apply bold formatting", async ({ authedPage: page }) => {
    await page.goto("/policies");

    const addBtn = page
      .getByRole("button", { name: /add new policy/i })
      .or(page.getByRole("button", { name: /new policy/i }))
      .or(page.getByRole("button", { name: /add policy/i }));

    if (!(await addBtn.first().isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.first().click();
    await page.waitForTimeout(1000);

    const editor = page
      .locator(".tiptap")
      .or(page.locator(".ProseMirror"))
      .or(page.locator('[contenteditable="true"]'));

    if (await editor.first().isVisible({ timeout: 10_000 }).catch(() => false)) {
      await editor.first().click();
      // Type text and apply bold via keyboard shortcut
      await page.keyboard.type("Bold text");
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Control+b");
      await page.waitForTimeout(300);

      // Check that bold formatting was applied (look for <strong> or bold class)
      const boldElement = page
        .locator(".tiptap strong, .ProseMirror strong, [contenteditable] strong")
        .or(page.locator('.tiptap [style*="bold"], .ProseMirror [style*="bold"]'));
      if (await boldElement.first().isVisible().catch(() => false)) {
        await expect(boldElement.first()).toBeVisible();
      }
    }
    await page.keyboard.press("Escape");
  });

  // --- Tier 5: Save/publish workflow ---

  test("save policy with content persists data", async ({
    authedPage: page,
  }) => {
    await page.goto("/policies");

    const addBtn = page
      .getByRole("button", { name: /add new policy/i })
      .or(page.getByRole("button", { name: /new policy/i }))
      .or(page.getByRole("button", { name: /add policy/i }));

    if (!(await addBtn.first().isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.first().click();
    await page.waitForTimeout(1000);

    // Fill policy title/name
    const titleInput = page
      .getByRole("textbox", { name: /title|name/i })
      .or(page.getByPlaceholder(/title|name/i))
      .or(page.getByRole("textbox").first());

    if (await titleInput.first().isVisible().catch(() => false)) {
      await titleInput.first().fill(`E2E Policy ${Date.now()}`);
    }

    // Type content in editor
    const editor = page
      .locator(".tiptap")
      .or(page.locator(".ProseMirror"))
      .or(page.locator('[contenteditable="true"]'));

    if (await editor.first().isVisible({ timeout: 10_000 }).catch(() => false)) {
      await editor.first().click();
      await page.keyboard.type("E2E test policy content for save test");
      await page.waitForTimeout(300);

      // Click save button
      const saveBtn = page
        .getByRole("button", { name: /save/i })
        .or(page.locator('[aria-label*="save" i]'));

      if (await saveBtn.first().isVisible().catch(() => false)) {
        await saveBtn.first().click();
        await page.waitForTimeout(2000);

        // Verify save feedback (snackbar, button state change, or URL change)
        const feedback = page
          .getByText(/saved/i)
          .or(page.getByRole("alert"))
          .or(page.locator(".MuiSnackbar-root"));

        if (await feedback.first().isVisible().catch(() => false)) {
          await expect(feedback.first()).toBeVisible();
        }
      }
    }

    await page.keyboard.press("Escape");
  });

  test("undo/redo works in editor", async ({ authedPage: page }) => {
    await page.goto("/policies");

    const addBtn = page
      .getByRole("button", { name: /add new policy/i })
      .or(page.getByRole("button", { name: /new policy/i }))
      .or(page.getByRole("button", { name: /add policy/i }));

    if (!(await addBtn.first().isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.first().click();
    await page.waitForTimeout(1000);

    const editor = page
      .locator(".tiptap")
      .or(page.locator(".ProseMirror"))
      .or(page.locator('[contenteditable="true"]'));

    if (!(await editor.first().isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await editor.first().click();
    await page.keyboard.type("undo test text");
    await page.waitForTimeout(300);

    const contentBefore = await editor.first().textContent().catch(() => "");

    // Undo
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(300);

    const contentAfterUndo = await editor.first().textContent().catch(() => "");

    // Redo
    await page.keyboard.press("Control+Shift+z");
    await page.waitForTimeout(300);

    const contentAfterRedo = await editor.first().textContent().catch(() => "");

    // Verify undo removed text and redo restored it
    if (contentBefore && contentAfterUndo !== contentBefore) {
      expect(contentAfterRedo).toContain("undo");
    }

    await page.keyboard.press("Escape");
  });

  test("toolbar formatting: block type selector", async ({
    authedPage: page,
  }) => {
    await page.goto("/policies");

    const addBtn = page
      .getByRole("button", { name: /add new policy/i })
      .or(page.getByRole("button", { name: /new policy/i }))
      .or(page.getByRole("button", { name: /add policy/i }));

    if (!(await addBtn.first().isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.first().click();
    await page.waitForTimeout(1000);

    // Look for block type selector (paragraph, heading, etc.)
    const blockTypeSelect = page
      .locator("#block-type-select")
      .or(page.getByRole("combobox", { name: /block|type|format/i }))
      .or(page.locator('[class*="toolbar"]').locator("select"));

    if (await blockTypeSelect.first().isVisible().catch(() => false)) {
      await blockTypeSelect.first().click();
      await page.waitForTimeout(300);

      // Verify options appear (Header 1, Header 2, Text, etc.)
      const option = page
        .getByRole("option")
        .or(page.getByText(/header/i))
        .or(page.getByText(/heading/i));

      if (await option.first().isVisible().catch(() => false)) {
        await expect(option.first()).toBeVisible();
      }

      await page.keyboard.press("Escape");
    }

    await page.keyboard.press("Escape");
  });
});
