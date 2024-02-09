// Canvas size
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 200;

// Padding
const PADDING_TOP = CANVAS_WIDTH / 100;
const PADDING_BOTTOM = PADDING_TOP;
const PADDING_LEFT = PADDING_TOP;
const PADDING_RIGHT = PADDING_TOP;

// Graph size
const USEABLE_X = PADDING_LEFT;
const USEABLE_X_END = CANVAS_WIDTH - PADDING_RIGHT;
const USEABLE_Y = PADDING_TOP;
const USEABLE_Y_END = CANVAS_HEIGHT - PADDING_BOTTOM
const USEABLE_W = CANVAS_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const USEABLE_H = CANVAS_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

// Point stuff
const POINT_SIZE = 2;
const MAX_POINTS_H = USEABLE_W / POINT_SIZE;
const MAX_POINTS_V = USEABLE_H / POINT_SIZE;

// Fields
const FIELDS_TO_DISPLAY = ['timestamp_ms', 'voltage', 'current', 'active_power']
const FIELD_TO_GRAPH = 'active_power'

class Graph{
    constructor(canvas){
        this.canvas = canvas;
        this.context = canvas.getContext('2d');

        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;
    }

    update(results, startStamp, endStamp){
        // Group results by time to fit graph
        let groups = this.groupResults(results, startStamp, endStamp);
        
        // Average each group
        let groupsAvg = this.avgGroups(groups)
        
        // Get the field out of each avg group
        let pointsToDraw = groupsAvg.map(item => item[FIELD_TO_GRAPH])

        // Draw graph with points
        this.draw(pointsToDraw)
    }

    draw(points){
        // Clear canvas
        this.context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Set fill color
        this.context.fillStyle = 'red';

        // Get the upper bound
        let maxValue = Math.max(...points);

        for (let i in points){
            // Get current value
            let value = points[i];
            
            // Map the value relative to max value, to point on graph
            let pointY = Math.floor(this.map(value, 0, maxValue, 0, MAX_POINTS_V));

            // Map the index relative to array to point on graph
            let pointX = Math.floor(this.map(i, 0, points.length, 0, MAX_POINTS_H));

            // Get the y coord for center of point of graph
            let y = PADDING_TOP + Math.floor(this.map(pointY, 0, MAX_POINTS_V, USEABLE_H, 0));

            // Get x coord for center of point
            let x = PADDING_LEFT + Math.floor(this.map(pointX, 0, MAX_POINTS_H, 0, USEABLE_W));

            // Get the top left coords of point
            y = y - POINT_SIZE / 2
            x = x - POINT_SIZE / 2

            // Get width of point
            let w = POINT_SIZE;

            // Get heigh to bottom of graph
            let h = USEABLE_Y_END - y

            // Draw point
            this.context.fillRect(x, y, w, h);
        }
    }

    groupResults(results, start, end){
        // Create array to hold all points
        let groups = new Array(MAX_POINTS_H);

        for (let result of results){
            // Get the time result was taken
            let time = result['timestamp_ms'];

            // Map time relative to start and end, to be relative to point array
            let index = Math.floor(this.map(time, start, end, 0, MAX_POINTS_H));

            // If array for group not yet created
            if (!groups[index]){
                // Make an array
                groups[index] = [];
            }

            // Push result into its group
            groups[index].push(result)
        }

        return groups;
    }

    avgGroups(groups){
        let averages = []

        // Iterate over every group
        for (let i = 0; i < groups.length; i++){
            let group = groups[i];

            averages[i] = {};

            // Iterate over every result key to average
            for (let key of FIELDS_TO_DISPLAY){
                // If group has values
                if (group){
                    // Get values for that key
                    let values = groups[i].map(item => item[key]);
                    // Calculate average
                    averages[i][key] = this.calcAvg(values)
                }
                else{
                    // If group is empty, assume 0
                    averages[i][key] = 0
                }
            }
        }

        return averages;
    }

    calcAvg(values){
        let sum = 0;

        // Get sum
        for (let value of values){
            sum += value;
        }

        // Return avg
        return sum / values.length
    }
    
    map(value, inMin, inMax, outMin, outMax){
        // Map value between 2 ranges to fit with another 2 ranges
        return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin
    }
}