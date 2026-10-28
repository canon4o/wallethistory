-- 0002: default data for every new user.
-- After a user row is inserted: one "Cash" account and the default income/expense categories.
-- No default tags. Icon keys come from lib/category-icons.ts; colors from the app's preset palette.

CREATE FUNCTION public.create_user_defaults() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.accounts (user_id, name, type, initial_balance)
  VALUES (NEW.id, 'Cash', 'cash', 0);

  INSERT INTO public.categories (user_id, type, name, color, icon) VALUES
    -- Income
    (NEW.id, 'income',  'Salary',          '#9cca56', 'banknote'),
    (NEW.id, 'income',  'Freelance',       '#1aaaba', 'laptop'),
    (NEW.id, 'income',  'Gifts',           '#8e6bbf', 'gift'),
    (NEW.id, 'income',  'Refunds',         '#337ab7', 'undo-2'),
    (NEW.id, 'income',  'Other Income',    '#6b7c85', 'ellipsis'),
    -- Expense
    (NEW.id, 'expense', 'Food & Dining',   '#ea9150', 'utensils'),
    (NEW.id, 'expense', 'Groceries',       '#9cca56', 'shopping-cart'),
    (NEW.id, 'expense', 'Rent',            '#337ab7', 'home'),
    (NEW.id, 'expense', 'Utilities',       '#ffd100', 'zap'),
    (NEW.id, 'expense', 'Transport',       '#1aaaba', 'car'),
    (NEW.id, 'expense', 'Health',          '#df697f', 'heart-pulse'),
    (NEW.id, 'expense', 'Entertainment',   '#8e6bbf', 'film'),
    (NEW.id, 'expense', 'Shopping',        '#ea9150', 'shopping-bag'),
    (NEW.id, 'expense', 'Education',       '#337ab7', 'graduation-cap'),
    (NEW.id, 'expense', 'Travel',          '#1aaaba', 'plane'),
    (NEW.id, 'expense', 'Other Expense',   '#6b7c85', 'ellipsis');

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_create_defaults
AFTER INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.create_user_defaults();
