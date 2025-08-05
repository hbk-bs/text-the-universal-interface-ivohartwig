let content = '';
let form;
function setup() {
	const canvas = createCanvas(100, 100);
	canvas.parent('sketch');
	background('black');
	form = document.querySelector('form');

	select('input').value('Hey!');

	form.addEventListener('submit', (e) => {
		e.preventDefault();
		content = e.target.content.value;
		console.log(content);
		form.reset();
	});
}

function draw() {
	background('black');
	fill('white');
	textAlign(CENTER, CENTER);
	text(content, width / 2, height / 2);
}
