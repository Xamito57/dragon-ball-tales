/**
 * Dragon Ball Tales - 3D Dice Rolling System
 * Uses Three.js for realistic dice animation
 */

class Dice3D {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.dice = null;
        this.isRolling = false;
        this.rollResult = 0;

        this.init();
    }

    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = null; // Transparent

        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            50,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.z = 5;

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);

        const pointLight = new THREE.PointLight(0xff6b00, 0.5);
        pointLight.position.set(-3, 2, 3);
        this.scene.add(pointLight);

        // Create dice
        this.createDice();

        // Handle resize
        window.addEventListener('resize', () => this.handleResize());

        // Start render loop
        this.animate();
    }

    createDice() {
        // Create icosahedron for D20
        const geometry = new THREE.IcosahedronGeometry(1, 0);

        // Create gradient material
        const material = new THREE.MeshPhongMaterial({
            color: 0x1a1a2e,
            emissive: 0xff6b00,
            emissiveIntensity: 0.1,
            shininess: 100,
            specular: 0xffd700
        });

        this.dice = new THREE.Mesh(geometry, material);

        // Add edge lines for better visibility
        const edgeGeometry = new THREE.EdgesGeometry(geometry);
        const edgeMaterial = new THREE.LineBasicMaterial({
            color: 0xff6b00,
            linewidth: 2
        });
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        this.dice.add(edges);

        this.scene.add(this.dice);
    }

    handleResize() {
        if (!this.container) return;

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.dice && !this.isRolling) {
            // Idle animation - gentle rotation
            this.dice.rotation.x += 0.003;
            this.dice.rotation.y += 0.005;
        }

        this.renderer.render(this.scene, this.camera);
    }

    async roll() {
        if (this.isRolling) return null;

        this.isRolling = true;

        // Calculate final result
        this.rollResult = Math.floor(Math.random() * 20) + 1;

        // Animation parameters
        const duration = 2000; // 2 seconds
        const startTime = Date.now();

        // Random final rotation
        const finalRotation = {
            x: Math.random() * Math.PI * 8 + Math.PI * 4,
            y: Math.random() * Math.PI * 8 + Math.PI * 4,
            z: Math.random() * Math.PI * 4
        };

        // Start rotation
        const startRotation = {
            x: this.dice.rotation.x,
            y: this.dice.rotation.y,
            z: this.dice.rotation.z
        };

        return new Promise((resolve) => {
            const animateRoll = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Easing function - ease out bounce effect
                const easeProgress = 1 - Math.pow(1 - progress, 3);

                // Apply rotation
                this.dice.rotation.x = startRotation.x + (finalRotation.x * easeProgress);
                this.dice.rotation.y = startRotation.y + (finalRotation.y * easeProgress);
                this.dice.rotation.z = startRotation.z + (finalRotation.z * easeProgress);

                // Bounce effect on scale
                const bounceScale = 1 + Math.sin(progress * Math.PI * 4) * 0.1 * (1 - progress);
                this.dice.scale.setScalar(bounceScale);

                // Color pulse based on progress
                if (this.dice.material) {
                    const pulseIntensity = 0.1 + Math.sin(progress * Math.PI * 6) * 0.15;
                    this.dice.material.emissiveIntensity = pulseIntensity;
                }

                if (progress < 1) {
                    requestAnimationFrame(animateRoll);
                } else {
                    // Animation complete
                    this.isRolling = false;
                    this.dice.scale.setScalar(1);

                    // Final color based on result
                    if (this.rollResult === 20) {
                        this.dice.material.emissive.setHex(0x00ff88); // Critical - green
                        this.dice.material.emissiveIntensity = 0.3;
                    } else if (this.rollResult === 1) {
                        this.dice.material.emissive.setHex(0xff4444); // Fumble - red
                        this.dice.material.emissiveIntensity = 0.3;
                    } else {
                        this.dice.material.emissive.setHex(0xff6b00); // Normal - orange
                        this.dice.material.emissiveIntensity = 0.1;
                    }

                    resolve(this.rollResult);
                }
            };

            animateRoll();
        });
    }

    destroy() {
        if (this.renderer) {
            this.renderer.dispose();
            if (this.container.contains(this.renderer.domElement)) {
                this.container.removeChild(this.renderer.domElement);
            }
        }
    }
}

// Roll History Manager
class RollHistory {
    constructor(maxItems = 50) {
        this.history = [];
        this.maxItems = maxItems;
        this.sessionId = Date.now().toString(36);
    }

    add(roll) {
        const entry = {
            id: Date.now(),
            ...roll,
            timestamp: new Date().toISOString()
        };

        this.history.unshift(entry);

        if (this.history.length > this.maxItems) {
            this.history.pop();
        }

        this.save();
        return entry;
    }

    getAll() {
        return this.history;
    }

    clear() {
        this.history = [];
        this.save();
    }

    save() {
        // Only save to session storage (cleared on logout)
        sessionStorage.setItem('rollHistory_' + this.sessionId, JSON.stringify(this.history));
    }

    load() {
        const saved = sessionStorage.getItem('rollHistory_' + this.sessionId);
        if (saved) {
            this.history = JSON.parse(saved);
        }
    }

    async saveToServer(sheetId) {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;

            for (const roll of this.history) {
                await fetch(`/api/sheets/${sheetId}/rolls`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ roll })
                });
            }
        } catch (e) {
            console.error('Failed to save rolls to server:', e);
        }
    }

    async loadFromServer(sheetId) {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;

            const res = await fetch(`/api/sheets/${sheetId}/rolls`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                this.history = await res.json();
            }
        } catch (e) {
            console.error('Failed to load rolls from server:', e);
        }
    }
}

// Export for use in character sheet
window.Dice3D = Dice3D;
window.RollHistory = RollHistory;
