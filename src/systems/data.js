// Game content tables: groceries, diner menu, recipes, apartment upgrades, goals.

export const CATS = {
  produce: { name: 'Fresh produce', blurb: 'Crisp, colourful and locally grown.' },
  dairy: { name: 'Dairy & eggs', blurb: 'The cold wall at the back of the store.' },
  pantry: { name: 'Pantry aisle', blurb: 'Pasta, rice, sauces and staples.' },
  breakfast: { name: 'Breakfast aisle', blurb: 'Cereal, coffee, and morning things.' },
  snacks: { name: 'Snacks & drinks', blurb: 'Crunchy, sweet, fizzy.' },
  frozen: { name: 'Frozen foods', blurb: 'Pizza, ice cream and friends.' },
  meat: { name: 'Meat & deli', blurb: 'Butcher counter and fish.' },
  bakery: { name: 'Bakery', blurb: 'Still warm from the oven.' },
};

// eat: instant hunger/energy if eaten straight from the fridge (null => needs cooking)
export const GROCERY = [
  { id: 'apple', name: 'Honeycrisp apples', cat: 'produce', price: 1.4, eat: [9, 1] },
  { id: 'banana', name: 'Bananas', cat: 'produce', price: 1.1, eat: [10, 2] },
  { id: 'salad', name: 'Salad kit', cat: 'produce', price: 4.2, eat: [22, 2] },
  { id: 'tomato', name: 'Vine tomatoes', cat: 'produce', price: 3.5, eat: [8, 0] },
  { id: 'avocado', name: 'Avocados', cat: 'produce', price: 2.2, eat: [12, 1] },
  { id: 'lemon', name: 'Lemons', cat: 'produce', price: 1.6, eat: null },
  { id: 'eggs', name: 'Free-range eggs', cat: 'dairy', price: 4.6, eat: null },
  { id: 'milk', name: 'Whole milk', cat: 'dairy', price: 3.3, eat: [8, 1] },
  { id: 'cheese', name: 'Aged cheddar', cat: 'dairy', price: 5.5, eat: [12, 0] },
  { id: 'yogurt', name: 'Greek yogurt', cat: 'dairy', price: 1.7, eat: [14, 1] },
  { id: 'pasta', name: 'Bronze-cut pasta', cat: 'pantry', price: 2.6, eat: null },
  { id: 'sauce', name: 'Tomato & basil sauce', cat: 'pantry', price: 3.4, eat: null },
  { id: 'rice', name: 'Jasmine rice', cat: 'pantry', price: 3.9, eat: null },
  { id: 'oil', name: 'Olive oil', cat: 'pantry', price: 9.5, eat: null },
  { id: 'cereal', name: 'Honey oat cereal', cat: 'breakfast', price: 4.9, eat: [16, 2] },
  { id: 'coffee', name: 'Coffee beans (8 cups)', cat: 'breakfast', price: 12.0, eat: null },
  { id: 'oats', name: 'Rolled oats', cat: 'breakfast', price: 3.6, eat: null },
  { id: 'chips', name: 'Sea-salt chips', cat: 'snacks', price: 3.2, eat: [11, 0] },
  { id: 'choc', name: 'Dark chocolate bar', cat: 'snacks', price: 2.6, eat: [9, 5] },
  { id: 'soda', name: 'Ginger soda', cat: 'snacks', price: 1.9, eat: [4, 5] },
  { id: 'water', name: 'Sparkling water', cat: 'snacks', price: 1.3, eat: [1, 2] },
  { id: 'energy', name: 'Focus drink', cat: 'snacks', price: 3.4, eat: [2, 22] },
  { id: 'pizza', name: 'Frozen margherita pizza', cat: 'frozen', price: 6.8, eat: null },
  { id: 'icecream', name: 'Salted caramel ice cream', cat: 'frozen', price: 5.8, eat: [15, 3] },
  { id: 'chicken', name: 'Chicken breast', cat: 'meat', price: 8.4, eat: null },
  { id: 'salmon', name: 'Salmon fillet', cat: 'meat', price: 12.5, eat: null },
  { id: 'sausage', name: 'Smoked sausages', cat: 'meat', price: 6.7, eat: null },
  { id: 'bread', name: 'Sourdough loaf', cat: 'bakery', price: 4.2, eat: [18, 1] },
  { id: 'croissant', name: 'Butter croissants', cat: 'bakery', price: 2.9, eat: [16, 3] },
  { id: 'muffin', name: 'Blueberry muffins', cat: 'bakery', price: 3.4, eat: [15, 3] },
];

export const BURGER = [
  { id: 'classic', name: 'Classic Burger', price: 8.5, hunger: 45, energy: 3, desc: 'Beef patty, cheddar, pickles, house sauce.' },
  { id: 'double', name: 'Double Stack', price: 11.0, hunger: 60, energy: 3, desc: 'Two patties, double cheese, crispy onions.' },
  { id: 'chicken', name: 'Chicken Melt', price: 9.0, hunger: 48, energy: 3, desc: 'Crispy chicken, swiss, honey mustard.' },
  { id: 'veggie', name: 'Veggie Deluxe', price: 9.5, hunger: 42, energy: 5, desc: 'Black bean patty, avocado, sprouts.' },
  { id: 'fries', name: 'Crispy Fries', price: 4.0, hunger: 18, energy: 0, desc: 'Skin-on, salted, perfect.' },
  { id: 'rings', name: 'Onion Rings', price: 5.0, hunger: 18, energy: 0, desc: 'Beer-battered, golden.' },
  { id: 'shake', name: 'Vanilla Shake', price: 5.5, hunger: 16, energy: 6, desc: 'Thick, cold, real vanilla.' },
  { id: 'cola', name: 'Cola', price: 3.0, hunger: 6, energy: 8, desc: 'Fizzy, ice-cold.' },
  { id: 'salad', name: 'Garden Salad', price: 9.0, hunger: 30, energy: 6, desc: 'For balance. Sort of.' },
  { id: 'combo', name: 'Classic Combo', price: 13.5, hunger: 72, energy: 10, desc: 'Burger + fries + a drink.' },
  { id: 'dcombo', name: 'Double Combo', price: 16.0, hunger: 92, energy: 10, desc: 'The big one.' },
  { id: 'kids', name: 'Kids Meal', price: 7.5, hunger: 36, energy: 4, desc: 'Small burger, fries, toy (no toy).' },
];

// needs: ingredient id -> count
export const RECIPES = [
  { id: 'cerealbowl', name: 'Cereal bowl', needs: { cereal: 1, milk: 1 }, hunger: 32, energy: 3, minutes: 4, desc: 'The classic. No judgement.' },
  { id: 'omelette', name: 'Cheddar omelette', needs: { eggs: 1, cheese: 1 }, hunger: 38, energy: 6, minutes: 15, desc: 'Fluffy, golden, a little smoky.' },
  { id: 'toast', name: 'Eggs on toast', needs: { bread: 1, eggs: 1 }, hunger: 34, energy: 5, minutes: 12, desc: 'Sourdough with a jammy yolk.' },
  { id: 'pasta', name: 'Pasta pomodoro', needs: { pasta: 1, sauce: 1 }, hunger: 50, energy: 4, minutes: 20, desc: 'Al dente with basil sauce.' },
  { id: 'pizza', name: 'Margherita pizza', needs: { pizza: 1 }, hunger: 46, energy: 3, minutes: 15, desc: 'Oven-crisp in 12 minutes.' },
  { id: 'chickenrice', name: 'Chicken & rice', needs: { chicken: 1, rice: 1 }, hunger: 64, energy: 8, minutes: 30, desc: 'Pan-seared with lemony rice.' },
  { id: 'salmon', name: 'Salmon & salad', needs: { salmon: 1, salad: 1 }, hunger: 58, energy: 10, minutes: 25, desc: 'Crispy skin, bright greens.' },
  { id: 'sausage', name: 'Sausages & bread', needs: { sausage: 1, bread: 1 }, hunger: 52, energy: 4, minutes: 18, desc: 'Smoky, hearty.' },
  { id: 'caprese', name: 'Tomato & cheddar plate', needs: { tomato: 1, cheese: 1, bread: 1 }, hunger: 36, energy: 4, minutes: 8, desc: 'Fresh, simple, fast.' },
];

export const UPGRADES = [
  { id: 'plants', name: 'Trailing plant set', price: 180, desc: 'Pothos vines spill from the shelves and window sills.' },
  { id: 'leds', name: 'Ambient LED lighting', price: 220, desc: 'Colour-shifting glow behind the TV and under the desk.' },
  { id: 'neon', name: 'Neon sign: "BUY LOW"', price: 260, desc: 'A pink neon reminder above the sofa.' },
  { id: 'espresso', name: 'Espresso machine', price: 320, desc: 'Coffee gives a much bigger energy boost.' },
  { id: 'art', name: 'Gallery canvas', price: 450, desc: 'A huge abstract painting for the living room.' },
  { id: 'telescope', name: 'Brass telescope', price: 900, desc: 'A balcony telescope for city and star gazing.' },
];

export const GOALS = [
  { id: 'window', text: 'Take in the view from the window' },
  { id: 'market', text: 'Check the trading terminal at your desk' },
  { id: 'lunch', text: 'Go downstairs and get something to eat' },
  { id: 'groceries', text: 'Buy groceries and stock the fridge' },
  { id: 'cook', text: 'Cook a meal at home' },
  { id: 'upgrade', text: 'Buy something nice for the apartment' },
];
