const WIDTH = 1000;
const HEIGHT = 200;
const POINT_SIZE = 1;
const MAX_POINTS_H = WIDTH / POINT_SIZE;
const MAX_POINTS_V = HEIGHT / POINT_SIZE;

const PADDING_Y = HEIGHT * 0.1;

const FIELDS_TO_DISPLAY = ['timestamp_ms', 'voltage', 'current', 'active_power']
const FIELD_TO_GRAPH = 'active_power'

class Graph{
    constructor(canvas){
        this.canvas = canvas;
        this.context = canvas.getContext('2d');

        this.canvas.width = WIDTH;
        this.canvas.height = HEIGHT;
    }

    update(results, startStamp, endStamp){
        // console.log(results, startStamp, endStamp);
        let groups = this.groupResults(results, startStamp, endStamp);
        
        let groupsAvg = this.avgGroups(groups)
        
        let pointsToDraw = groupsAvg.map(item => item[FIELD_TO_GRAPH])
        this.draw(pointsToDraw)
    }

    avgGroups(groups){
        let averages = []

        for (let i = 0; i < groups.length; i++){
            let group = groups[i];

            averages[i] = {};

            for (let key of FIELDS_TO_DISPLAY){
                if (group){
                    let values = groups[i].map(item => item[key]);
                    averages[i][key] = this.calcAvg(values)
                }
                else{
                    averages[i][key] = 0
                }
            }
        }

        return averages;
    }

    calcAvg(values){
        let sum = 0;

        for (let value of values){
            sum += value;
        }

        return sum / values.length
    }
    
    map(value, inMin, inMax, outMin, outMax){
        return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin
    }

    groupResults(results, start, end){
        let groups = new Array(MAX_POINTS_H);

        for (let result of results){
            let time = result['timestamp_ms'];
            let index = Math.floor(this.map(time, start, end, 0, MAX_POINTS_H));

            if (!groups[index]){
                groups[index] = [];
            }

            groups[index].push(result)
        }

        return groups;
    }

    draw(points){
        this.context.clearRect(0, 0, WIDTH, HEIGHT);

        this.context.fillStyle = 'red';

        let maxValue = Math.max(...points);
        for (let i in points){
            let value = points[i];
            let y = Math.floor(this.map(value, 0, maxValue, MAX_POINTS_V, PADDING_Y)) * POINT_SIZE;

            this.context.fillRect(i * POINT_SIZE, y, POINT_SIZE, HEIGHT - y);
        }
    }
}