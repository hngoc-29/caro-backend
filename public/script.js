const socket = io(`http://localhost:3000`);
const ghepngaunhien = () => {
    const name = $(`#nameinput`)[0].value;
    console.log(name)
    socket.emit(`ghepngaunhien`)
}
$(document).ready(() => {

});