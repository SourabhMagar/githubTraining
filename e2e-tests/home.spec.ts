import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the correct title', async ({ page }) => {
    await expect(page).toHaveTitle('Tailspin Toys - Crowdfunding your new favorite game!');
  });

  test('should display the main heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Welcome to Tailspin Toys', exact: true })).toBeVisible();
  });

  test('should display the site branding in header', async ({ page }) => {
    await expect(page.getByText('Tailspin Toys').first()).toBeVisible();
  });

  test('should display the welcome message', async ({ page }) => {
    await expect(page.getByText('Find your next game! And maybe even back one! Explore our collection!')).toBeVisible();
  });

  test('should filter games by category and publisher combination', async ({ page }) => {
    await page.goto('/?category=Strategy&publisher=CodeForge%20Studios');

    await expect(page.getByRole('checkbox', { name: 'Strategy' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'CodeForge Studios' })).toBeChecked();
    await expect(page.getByTestId('games-grid')).toContainText('DevOps Dominion');
    await expect(page.locator('[data-testid="game-card"]:visible')).toHaveCount(1);
  });

  test('should allow multiple selected categories and publishers', async ({ page }) => {
    await page.goto('/?category=Strategy&category=Puzzle&publisher=Ops%20Interactive');

    await expect(page.getByRole('checkbox', { name: 'Strategy' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Puzzle' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Ops Interactive' })).toBeChecked();
    await expect(page.locator('[data-testid="game-card"]:visible')).toHaveCount(2);
    await expect(page.getByTestId('active-filters-summary')).toContainText('Showing 2 matching games');
  });

  test('should clear filters back to the full catalog', async ({ page }) => {
    await page.goto('/?category=Strategy&publisher=CodeForge%20Studios');
    await page.getByTestId('clear-filters-link').click();

    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('clear-filters-link')).toHaveCount(0);
    await expect(page.getByTestId('game-card').first()).toBeVisible();
  });
});
