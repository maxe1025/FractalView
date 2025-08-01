async function main() {
	await initialize();
	requestAnimationFrame(render);
}

// this data is set in initialize() and used in render()
let gl;
let program;
let vao;
let uniformModelMatrixLocation;
let uniformViewMatrixLocation;
let uniformProjectionMatrixLocation;
let uniformPowerLocation;
let uniformFractalTypeLocation;

let currentFractalType = 0; // 0 = Mandelbulb, 1 = Julia
let sliderValue = 4.0;

let cameraDistance = 5;
let cameraRotation = { x: 15, y: 30 };

let isDragging = false;
let lastMouse = { x: 0, y: 0 };
let autoOrbit = true;
let lastTime = 0;

let uniformTimeLocation;
let canvas;

let performanceMult = 1;


async function initialize() {
	canvas = document.querySelector("canvas"); // get the html canvas element
	// everytime we talk to WebGL we use this object
	gl = canvas.getContext("webgl2", { alpha: false });

	if (!gl) { console.error("Your browser does not support WebGL2"); }
	// set the resolution of the html canvas element
	const dpr = window.devicePixelRatio || 1;
	canvas.width = canvas.clientWidth * dpr;
	canvas.height = canvas.clientHeight * dpr;
	gl.viewport(0, 0, canvas.width, canvas.height);

	// set the resolution of the framebuffer
	gl.viewport(0, 0, canvas.width, canvas.height);

	gl.enable(gl.DEPTH_TEST); // enable z-buffering
	gl.enable(gl.CULL_FACE); // enable back-face culling

	// loadTextResource returns a string that contains the content of a text file
	const vertexShaderText = await loadTextResource("shader.vert");
	const fragmentShaderText = await loadTextResource("shader.frag");
	// compile GLSL shaders - turn shader code into machine code that the GPU understands
	const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderText);
	const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderText);
	// link the two shaders - create a program that uses both shaders
	program = createProgram(gl, vertexShader, fragmentShader);

	uploadAttributeData();

	uniformModelMatrixLocation = gl.getUniformLocation(program, "u_modelMatrix");
	uniformViewMatrixLocation = gl.getUniformLocation(program, "u_viewMatrix");
	uniformProjectionMatrixLocation = gl.getUniformLocation(program, "u_projectionMatrix");
	uniformPowerLocation = gl.getUniformLocation(program, "u_power");
	uniformFractalTypeLocation = gl.getUniformLocation(program, "u_fractalType");
	uniformTimeLocation = gl.getUniformLocation(program, "iTime");

	document.getElementById("fractalSelect").addEventListener("change", (e) => {
		currentFractalType = (e.target.value === "julia") ? 1 : 0;
	});

	const slider = document.getElementById("slider");
	slider.addEventListener("input", () => {
		const minPower = 0.0;
		const maxPower = 10.0;
		const normalized = slider.value / 100.0;
		sliderValue = minPower + (maxPower - minPower) * normalized;
	});

	initCameraControlls();
	initExportButton();
	initPerformanceTab();
}

function initCameraControlls() {
	const canvas = document.querySelector("canvas");

	canvas.addEventListener("mousedown", (e) => {
		isDragging = true;
		lastMouse.x = e.clientX;
		lastMouse.y = e.clientY;
	});

	canvas.addEventListener("mouseup", () => {
		isDragging = false;
	});

	canvas.addEventListener("mouseleave", () => {
		isDragging = false;
	});

	canvas.addEventListener("mousemove", (e) => {
		if (!isDragging) return;
		const dx = e.clientX - lastMouse.x;
		const dy = e.clientY - lastMouse.y;

		cameraRotation.y += dx * 0.5;
		cameraRotation.x += dy * 0.5;

		cameraRotation.x = Math.max(-89, Math.min(89, cameraRotation.x));

		lastMouse.x = e.clientX;
		lastMouse.y = e.clientY;
	});

	canvas.addEventListener("wheel", (e) => {
		e.preventDefault();
		const zoomAmount = e.deltaY * 0.01;
		cameraDistance += zoomAmount;
		cameraDistance = Math.max(1.0, Math.min(50.0, cameraDistance));
	});

	document.getElementById("orbitToggle").addEventListener("change", (e) => {
		autoOrbit = e.target.checked;
	});
}

function initExportButton() {
	document.getElementById("saveBtn").addEventListener("click", () => {
		const canvas = document.querySelector("canvas");

		requestAnimationFrame(() => {
			const link = document.createElement("a");
			link.href = canvas.toDataURL("image/png");
			link.download = "fractal_scene.png";
			link.click();
		});
	});
}

function initPerformanceTab() {
	document.getElementById("qualitySelect").addEventListener("change", e => {
		performanceMult = parseFloat(e.target.value);
	});
}

function uploadAttributeData() {
	vao = gl.createVertexArray();
	gl.bindVertexArray(vao);

	const indexBuffer = gl.createBuffer();
	// gl.ELEMENT_ARRAY_BUFFER tells WebGL that this buffer should be treated as an index list
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(quadMesh.indices), gl.STATIC_DRAW);

	const posBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadMesh.positions), gl.STATIC_DRAW);
	const posAttributeLocation = gl.getAttribLocation(program, "a_position");
	gl.vertexAttribPointer(posAttributeLocation, 3, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(posAttributeLocation);

	const uvBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadMesh.uvs), gl.STATIC_DRAW);
	const uvAttributeLocation = gl.getAttribLocation(program, "a_uv");
	gl.vertexAttribPointer(uvAttributeLocation, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(uvAttributeLocation);

	// unbind to avoid accidental modification
	gl.bindVertexArray(null); // before other unbinds
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
}

function render(time) {
	resizeCanvasToDisplaySize();

	const deltaTime = time - lastTime;
	lastTime = time;

	if (autoOrbit) {
		cameraRotation.y += deltaTime * 0.02;
	}

	gl.clearColor(0, 0, 0, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.useProgram(program);

	gl.bindVertexArray(vao);

	gl.uniform1f(uniformPowerLocation, sliderValue);
	gl.uniform1i(uniformFractalTypeLocation, currentFractalType);
	gl.uniform1f(uniformTimeLocation, time * 0.001);

	setMatrices();
	const numVertices = quadMesh.indices.length;
	gl.drawElements(gl.TRIANGLES, numVertices, gl.UNSIGNED_SHORT, 0);

	// unbind to avoid accidental modification
	gl.bindVertexArray(vao);
	gl.useProgram(null);

	requestAnimationFrame(render);
}

function resizeCanvasToDisplaySize() {
	const dpr = window.devicePixelRatio || 1;
	const displayWidth  = Math.floor(canvas.clientWidth  * dpr * performanceMult);
	const displayHeight = Math.floor(canvas.clientHeight * dpr * performanceMult);

	if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
		canvas.width = displayWidth;
		canvas.height = displayHeight;

		gl.viewport(0, 0, canvas.width, canvas.height);

		setMatrices();
	}
}


function setMatrices() {
	// use row-major notation (like in maths)
	const modelMatrix = [
		1,0,0,0,
		0,1,0,0,
		0,0,1,0,
		0,0,0,1,
	];

	const vT = mat4Translation(0,0,-cameraDistance);
	const vRy = mat4RotY(cameraRotation.y * Math.PI / 180);
	const vRx = mat4RotX(cameraRotation.x * Math.PI / 180);
	const viewMatrix = mat4Mul(vT, mat4Mul(vRx, vRy));

	const canvas = document.querySelector("canvas");
	const aspectRatio = canvas.width / canvas.height;
	const projectionMatrix = perspective(45, aspectRatio, 0.01, 100);

	// we set transpose to true to convert to column-major
	gl.uniformMatrix4fv(uniformModelMatrixLocation, true, modelMatrix);
	gl.uniformMatrix4fv(uniformViewMatrixLocation, true, viewMatrix);
	gl.uniformMatrix4fv(uniformProjectionMatrixLocation, true, projectionMatrix);
}

main();
