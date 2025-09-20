Start XAMPP Control Panel
	Start Apache
	Start MySQL (MariaDB)

Launch CMD prompt as Admin
	Starts in this Dir: PS C:\Users\reian>
	cd\
	cd xampp/htdocs/stockloyal-pwa

ctl-C to kill active session
npx kill-port 5173 (5173 and/or 5174 if necessary)
npm run dev -- --host

Open new Incognito browser window

http://localhost:5173 (root dir is localhost:5173/stockloyal-pwa, progressive web app (PWA))

directory structure fr app:
	C:\xampp\htdocs\stockloyal-pwa ()
		1. C:\xampp\htdocs\stockloyal-pwa\api (php modules for MySQL database access)
		2. C:\xampp\htdocs\stockloyal-pwa\img
		3. C:\xampp\htdocs\stockloyal-pwa\node_modules (React and Vite)
		4. C:\xampp\htdocs\stockloyal-pwa\public (icons and logos)
		5. C:\xampp\htdocs\stockloyal-pwa\src (top level .jsx and .css files)
			5a. C:\xampp\htdocs\stockloyal-pwa\src\assets (react.svg)
			5b. C:\xampp\htdocs\stockloyal-pwa\src\pages (stockloyal-pwa web app modules)





Brand Gold Palette

Base (logo star) → #D5A928
RGB: (213, 169, 40)

Lighter (highlight / background fill) → #E6C95A
RGB: (230, 201, 90)

Lightest (soft hover / background tint) → #F2DEA0
RGB: (242, 222, 160)

Darker (hover / border) → #B4881F
RGB: (180, 136, 31)

Darkest (active / pressed state) → #8A6916
RGB: (138, 105, 22)
