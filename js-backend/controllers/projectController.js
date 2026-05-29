const Project = require('../models/projectModel');
const fs = require('fs');
const path = require('path');

// Create project and upload images
exports.createProject = async (req, res) => {
  const { name } = req.body;

  try {
    // Create the project
    const project = new Project({ name, images: [] });

    // Save uploaded images in the specific folder and update project with image names
    if (req.files && req.files.length > 0) {
      const projectDir = path.join(__dirname, `../public/uploads/${project._id}/images`);

      // Ensure directory exists
      fs.mkdirSync(projectDir, { recursive: true });

      // Move uploaded files to the directory
      req.files.forEach((file) => {
        const destPath = path.join(projectDir, file.filename);
        fs.renameSync(file.path, destPath); // Move file to the correct folder
        project.images.push(file.filename); // Save the file name in the project
      });
    }

    // Save the project in MongoDB
    await project.save();

    res.status(201).json({ message: 'Project created successfully', project });
  } catch (error) {
    res.status(500).json({ message: 'Error creating project', error });
  }
};

// Fetch a project by ID and return its data along with image URLs
exports.getProjectById = async (req, res) => {
  try {
    const projectId = req.params.id;
    
    // Find the project by its ID
    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Generate image URLs with proper indexing
    const imagesWithIndex = project.images.map((image, index) => {
      return {
        index: index + 1, // Image index starts from 1
        url: `${req.protocol}://${req.get('host')}/uploads/${project._id}/images/${image}`
      };
    });

    res.status(200).json({
      project: {
        id: project._id,
        name: project.name,
        images: imagesWithIndex // Image URLs with index
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching project', error });
  }
};