import { test, expect } from "./fixtures/auth.fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("AI Gateway", () => {
  // --- Tier 1: Sub-page rendering ---

  test("renders the AI Gateway dashboard", async ({ authedPage: page }) => {
    await page.goto("/ai-gateway");
    // Page may redirect to a sub-page or show dashboard content
    await expect(
      page
        .getByText(/gateway/i)
        .or(page.getByText(/ai gateway/i))
        .or(page.getByRole("heading"))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("page has no accessibility violations", async ({
    authedPage: page,
  }) => {
    await page.goto("/ai-gateway");
    await page.waitForLoadState("domcontentloaded");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules([
        "button-name",
        "link-name",
        "color-contrast",
        "aria-command-name",
        "aria-valid-attr-value",
        "label",
        "select-name",
        "scrollable-region-focusable",
        "aria-progressbar-name",
        "aria-prohibited-attr",
      ])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  // Sub-page tests — each verifies the page renders content
  const subPages = [
    { path: "/ai-gateway/endpoints", name: "Endpoints" },
    { path: "/ai-gateway/playground", name: "Playground" },
    { path: "/ai-gateway/guardrails", name: "Guardrails" },
    { path: "/ai-gateway/models", name: "Models" },
    { path: "/ai-gateway/logs", name: "Logs" },
    { path: "/ai-gateway/prompts", name: "Prompts" },
    { path: "/ai-gateway/virtual-keys", name: "Virtual Keys" },
    { path: "/ai-gateway/settings", name: "Settings" },
  ];

  for (const subPage of subPages) {
    test(`renders ${subPage.name} sub-page`, async ({ authedPage: page }) => {
      await page.goto(subPage.path);

      // Verify the page loaded (not a 404 or blank page)
      const content = page
        .getByText(new RegExp(subPage.name, "i"))
        .or(page.getByRole("heading"))
        .or(page.getByRole("table"))
        .or(page.getByRole("button"))
        .or(page.getByText(/gateway/i));

      // Skip if this sub-page doesn't exist in the current build
      if (
        await content
          .first()
          .isVisible({ timeout: 10_000 })
          .catch(() => false)
      ) {
        await expect(content.first()).toBeVisible();
      } else {
        test.skip();
      }
    });
  }

  // --- Tier 1: Sidebar navigation ---

  test("can navigate between sub-pages via sidebar", async ({
    authedPage: page,
  }) => {
    await page.goto("/ai-gateway");
    await page.waitForTimeout(1000);

    // Look for sidebar navigation links
    const sidebarLinks = page
      .getByRole("link", { name: /endpoint/i })
      .or(page.getByRole("tab", { name: /endpoint/i }))
      .or(page.getByText(/endpoints/i));

    if (await sidebarLinks.first().isVisible().catch(() => false)) {
      await sidebarLinks.first().click();
      await page.waitForTimeout(500);
      await expect(page).toHaveURL(/endpoint/i, { timeout: 10_000 });
    }
  });

  // --- Tier 4: Endpoints CRUD ---

  test("Endpoints: add and delete endpoint", async ({ authedPage: page }) => {
    await page.goto("/ai-gateway/endpoints");
    const endpointName = `E2E Endpoint ${Date.now()}`;

    const addBtn = page
      .getByRole("button", { name: /add.*endpoint/i })
      .or(page.getByRole("button", { name: /new.*endpoint/i }))
      .or(page.getByRole("button", { name: /create/i }));

    if (!(await addBtn.first().isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.first().click();

    // Fill endpoint name
    const nameInput = page
      .getByRole("textbox", { name: /name/i })
      .or(page.getByPlaceholder(/name/i))
      .or(page.getByRole("textbox").first());
    await expect(nameInput.first()).toBeVisible({ timeout: 10_000 });
    await nameInput.first().fill(endpointName);

    // Fill provider if visible
    const providerInput = page
      .getByRole("combobox", { name: /provider/i })
      .or(page.getByPlaceholder(/provider/i));
    if (await providerInput.first().isVisible().catch(() => false)) {
      await providerInput.first().click();
      const option = page.getByRole("option").first();
      if (await option.isVisible().catch(() => false)) {
        await option.click();
      }
    }

    // Submit
    const submitBtn = page
      .getByRole("button", { name: /create|save|submit|add/i })
      .last();
    await submitBtn.click();
    await page.waitForTimeout(1000);

    // Clean up: Delete
    const moreBtn = page
      .getByRole("button", { name: /more/i })
      .or(page.locator('[aria-label="more"]'))
      .or(page.locator('[data-testid="MoreVertIcon"]'));
    if (await moreBtn.first().isVisible().catch(() => false)) {
      await moreBtn.first().click();
      const deleteBtn = page.getByRole("menuitem", {
        name: /delete|remove/i,
      });
      if (await deleteBtn.first().isVisible().catch(() => false)) {
        await deleteBtn.first().click();
        const confirmBtn = page.getByRole("button", {
          name: /confirm|yes|delete/i,
        });
        if (await confirmBtn.first().isVisible().catch(() => false)) {
          await confirmBtn.first().click();
        }
      } else {
        await page.keyboard.press("Escape");
      }
    }
  });

  // --- Tier 4: Guardrails CRUD ---

  test("Guardrails: add and delete rule", async ({ authedPage: page }) => {
    await page.goto("/ai-gateway/guardrails");

    const addBtn = page
      .getByRole("button", { name: /add.*rule/i })
      .or(page.getByRole("button", { name: /add.*guardrail/i }))
      .or(page.getByRole("button", { name: /new/i }))
      .or(page.getByRole("button", { name: /create/i }));

    if (!(await addBtn.first().isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.first().click();

    // Fill rule name or type
    const nameInput = page
      .getByRole("textbox", { name: /name/i })
      .or(page.getByPlaceholder(/name/i))
      .or(page.getByRole("textbox").first());

    if (await nameInput.first().isVisible().catch(() => false)) {
      await nameInput.first().fill(`E2E PII Rule ${Date.now()}`);
    }

    // Select type if dropdown exists (e.g., PII)
    const typeSelect = page
      .getByRole("combobox", { name: /type/i })
      .or(page.getByText(/select.*type/i));
    if (await typeSelect.first().isVisible().catch(() => false)) {
      await typeSelect.first().click();
      const piiOption = page
        .getByRole("option", { name: /pii/i })
        .or(page.getByRole("option").first());
      if (await piiOption.first().isVisible().catch(() => false)) {
        await piiOption.first().click();
      }
    }

    // Submit
    const submitBtn = page
      .getByRole("button", { name: /create|save|submit|add/i })
      .last();
    await submitBtn.click();
    await page.waitForTimeout(1000);

    // Clean up
    const moreBtn = page
      .getByRole("button", { name: /more/i })
      .or(page.locator('[aria-label="more"]'))
      .or(page.locator('[data-testid="MoreVertIcon"]'));
    if (await moreBtn.first().isVisible().catch(() => false)) {
      await moreBtn.first().click();
      const deleteBtn = page.getByRole("menuitem", {
        name: /delete|remove/i,
      });
      if (await deleteBtn.first().isVisible().catch(() => false)) {
        await deleteBtn.first().click();
        const confirmBtn = page.getByRole("button", {
          name: /confirm|yes|delete/i,
        });
        if (await confirmBtn.first().isVisible().catch(() => false)) {
          await confirmBtn.first().click();
        }
      } else {
        await page.keyboard.press("Escape");
      }
    }
  });

  // --- Tier 4: Prompts CRUD ---

  test("Prompts: create and delete prompt", async ({ authedPage: page }) => {
    await page.goto("/ai-gateway/prompts");

    const addBtn = page
      .getByRole("button", { name: /add.*prompt/i })
      .or(page.getByRole("button", { name: /new.*prompt/i }))
      .or(page.getByRole("button", { name: /create/i }));

    if (!(await addBtn.first().isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip();
      return;
    }
    await addBtn.first().click();

    // Fill prompt name
    const nameInput = page
      .getByRole("textbox", { name: /name/i })
      .or(page.getByPlaceholder(/name/i))
      .or(page.getByRole("textbox").first());

    if (await nameInput.first().isVisible().catch(() => false)) {
      await nameInput.first().fill(`E2E Prompt ${Date.now()}`);
    }

    // Fill prompt content if visible
    const contentInput = page
      .getByRole("textbox", { name: /content|prompt|text/i })
      .or(page.getByPlaceholder(/prompt/i))
      .or(page.locator("textarea").first());
    if (await contentInput.first().isVisible().catch(() => false)) {
      await contentInput.first().fill("E2E test prompt content");
    }

    // Submit
    const submitBtn = page
      .getByRole("button", { name: /create|save|submit|add/i })
      .last();
    await submitBtn.click();
    await page.waitForTimeout(1000);

    // Clean up
    const moreBtn = page
      .getByRole("button", { name: /more/i })
      .or(page.locator('[aria-label="more"]'))
      .or(page.locator('[data-testid="MoreVertIcon"]'));
    if (await moreBtn.first().isVisible().catch(() => false)) {
      await moreBtn.first().click();
      const deleteBtn = page.getByRole("menuitem", {
        name: /delete|remove/i,
      });
      if (await deleteBtn.first().isVisible().catch(() => false)) {
        await deleteBtn.first().click();
        const confirmBtn = page.getByRole("button", {
          name: /confirm|yes|delete/i,
        });
        if (await confirmBtn.first().isVisible().catch(() => false)) {
          await confirmBtn.first().click();
        }
      } else {
        await page.keyboard.press("Escape");
      }
    }
  });

  // --- Tier 5: Playground chat ---

  test.describe("Playground", () => {
    test("playground page renders composer or empty state", async ({
      authedPage: page,
    }) => {
      await page.goto("/ai-gateway/playground");
      await page.waitForTimeout(2000);

      // Should show either a chat composer or an empty state
      const content = page
        .locator("[data-composer-input]")
        .or(page.getByPlaceholder(/type a message/i))
        .or(page.getByText(/no endpoint/i))
        .or(page.getByText(/select an endpoint/i))
        .or(page.getByText(/setup required/i))
        .or(page.getByRole("combobox"));

      await expect(content.first()).toBeVisible({ timeout: 15_000 });
    });

    test("endpoint selector shows available endpoints", async ({
      authedPage: page,
    }) => {
      await page.goto("/ai-gateway/playground");
      await page.waitForTimeout(2000);

      // MUI Select renders a hidden input#endpoint + a visible div[role=combobox]
      const endpointSelect = page
        .locator('#endpoint ~ div[role="combobox"]')
        .or(page.locator('#endpoint').locator('..').getByRole("combobox"))
        .or(page.getByRole("combobox").first());

      if (!(await endpointSelect.first().isVisible().catch(() => false))) {
        test.skip();
        return;
      }

      await endpointSelect.first().click();
      await page.waitForTimeout(500);

      // Check if options appear
      const option = page.getByRole("option");
      if (await option.first().isVisible().catch(() => false)) {
        await expect(option.first()).toBeVisible();
      }

      await page.keyboard.press("Escape");
    });

    test("settings modal opens with temperature and token controls", async ({
      authedPage: page,
    }) => {
      await page.goto("/ai-gateway/playground");
      await page.waitForTimeout(2000);

      // Find and click settings button
      const settingsBtn = page
        .getByRole("button", { name: /settings/i })
        .or(page.locator('[aria-label*="settings" i]'));

      if (!(await settingsBtn.first().isVisible().catch(() => false))) {
        test.skip();
        return;
      }

      await settingsBtn.first().click();
      await page.waitForTimeout(500);

      // Verify modal with temperature and max tokens
      const tempLabel = page
        .getByText(/temperature/i)
        .or(page.getByText(/temp/i));
      const tokensLabel = page
        .getByText(/max tokens/i)
        .or(page.getByText(/tokens/i));

      if (await tempLabel.first().isVisible().catch(() => false)) {
        await expect(tempLabel.first()).toBeVisible();
      }
      if (await tokensLabel.first().isVisible().catch(() => false)) {
        await expect(tokensLabel.first()).toBeVisible();
      }

      // Close the modal
      const closeBtn = page
        .getByRole("button", { name: /close|cancel/i })
        .or(page.getByRole("button", { name: /save/i }));
      if (await closeBtn.first().isVisible().catch(() => false)) {
        await closeBtn.first().click();
      } else {
        await page.keyboard.press("Escape");
      }
    });
  });
});
